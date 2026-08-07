// Переключение форматирования на выделении и вставка форматированного текста
// на чистом Selection/Range API (без execCommand), плюс сохранение/восстановление выделения.

import { ALL_FORMAT_TOOLS, FORMAT_TOOLS, blockTypeOfTag, type FormatTool } from "./format-config";

/** Канонические теги форматирования (в верхнем регистре, как tagName). */
const FORMAT_TAG_NAMES = ALL_FORMAT_TOOLS.map((t) => FORMAT_TOOLS[t].tag.toUpperCase());

// Все распознаваемые теги форматирования (канонические и синонимы) — для снятия форматирования
// целиком: в содержимом редактора синонимов быть не должно, но вставка и setValue могут их принести.
const MATCH_TAG_NAMES = Array.from(new Set(ALL_FORMAT_TOOLS.flatMap((t) => FORMAT_TOOLS[t].matchTags)));

// Селекторы считаем один раз: обе выборки идут на каждую правку формата и на каждое обновление панели.
const FORMAT_SELECTOR = FORMAT_TAG_NAMES.join(",").toLowerCase();
const MATCH_SELECTOR = MATCH_TAG_NAMES.join(",").toLowerCase();
// Инструменты, содержимое которых буквально (моноширинный): внутри них не бывает ни разметки
// (см. stripFormattingInCode), ни переносов строк — значение берёт оттуда голый текст.
const LITERAL_TAGS = ALL_FORMAT_TOOLS.filter((tool) => FORMAT_TOOLS[tool].literal).flatMap(
	(tool) => FORMAT_TOOLS[tool].matchTags
);
const CODE_SELECTOR = LITERAL_TAGS.join(",").toLowerCase();
const LITERAL_TAG_SET = new Set(LITERAL_TAGS);
// Неделимые объекты хоста: конструкции сообщения объявляют себя нередактируемыми
const ATOMIC_SELECTOR = '[contenteditable="false"]';

// Проверка тега идёт на каждого предка каждого текстового узла при каждом обходе — храним
// множествами, а не массивами: подсветка панели опрашивает их на каждое движение каретки.
const FORMAT_TAG_SET = new Set(FORMAT_TAG_NAMES);
const MATCH_TAG_SET = new Set(MATCH_TAG_NAMES);
const TOOL_TAG_SETS = ALL_FORMAT_TOOLS.reduce(
	(map, tool) => {
		map[tool] = new Set(FORMAT_TOOLS[tool].matchTags);
		return map;
	},
	{} as Record<FormatTool, Set<string>>
);

/** Ближайший предок-элемент с одним из тегов (в пределах root, не включая root). */
function formatAncestor(node: Node, tags: ReadonlySet<string>, root: HTMLElement): HTMLElement | null {
	let el = node.parentElement;
	while (el && el !== root) {
		if (tags.has(el.tagName)) return el;
		el = el.parentElement;
	}
	return null;
}

/**
 * Поддерево, которого достаточно для обхода диапазона. Обход всего редактора на каждый
 * запрос состояния панели стоит слишком дорого, а за пределами общего предка границ
 * диапазона попасть в него нечему.
 */
function rangeScope(root: HTMLElement, range: Range): Node {
	const scope = range.commonAncestorContainer;
	if (!root.contains(scope)) return root;

	// от текстового узла обходить нечего — берём его родителя (сам узел walker не вернёт)
	return scope.nodeType === Node.TEXT_NODE ? (scope.parentNode ?? root) : scope;
}

/**
 * Выделение документа, которому принадлежит узел, — для операций, которые выделение
 * устанавливают, а не читают.
 *
 * Окно берём у самого узла, а не глобальное: редактор может жить в iframe, где глобальный
 * `window` чужой и его выделение к нашему содержимому отношения не имеет; к тому же добраться
 * до глобального окружения можно не всегда (например, при разрушении контрола).
 */
export function documentSelection(node: Node): Selection | null {
	return node.ownerDocument?.defaultView?.getSelection() ?? null;
}

/**
 * Выделение, если оно стоит внутри root, иначе null. Единственная проверка «правка относится
 * к этому содержимому» — по ней работают и правки абзацев, и история, и хосты редактора.
 */
export function innerSelection(root: HTMLElement): Selection | null {
	const selection = documentSelection(root);
	if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) return null;

	// Оба конца, а не только якорь: выделение можно вытянуть из редактора на страницу,
	// и правка по такому диапазону трогала бы DOM за пределами содержимого.
	if (!root.contains(selection.focusNode)) return null;

	return selection;
}

/**
 * Выполняет правку, сохраняя каретку: положение запоминается текстовым смещением до правки
 * и возвращается после. Пропустить восстановление нельзя — правки пересоздают узлы, и прежнее
 * выделение указывало бы на те, которых в дереве уже нет.
 *
 * Если правка вернула false, значит DOM она не трогала: выделение живо, и переставлять его
 * незачем — лишний сброс способен прервать IME-набор.
 */
export function preserveCaret(root: HTMLElement, mutate: () => boolean | void): void {
	const selection = innerSelection(root);
	const bounds = selection ? selectionCharBounds(root, selection.getRangeAt(0)) : null;

	const touched = mutate();

	if (touched !== false && bounds && selection) restoreSelection(root, bounds[0], bounds[1], selection);
}

/**
 * Единица текстовых координат: символы текстового узла либо конец строки — мягкий перенос
 * и граница блока. Перенос обязан занимать позицию: иначе конец строки и начало следующей
 * неразличимы, и восстановленная по смещению каретка возвращается на строку выше (это видно
 * сразу после Enter, когда содержимое перестраивают — например подсветкой конструкций).
 */
type CharUnit = { kind: "text"; node: Text } | { kind: "line"; node: Node; offset: number };

/**
 * Обходит содержимое в текстовых координатах по порядку. `visit` возвращает true — обход
 * прекращается (границу нашли, дальше считать нечего).
 *
 * Позиция единицы «конец строки» — сразу ЗА переносом (или в начале следующего блока): именно
 * её занимает каретка, оказавшись на новой строке.
 */
function walkChars(root: HTMLElement, visit: (unit: CharUnit) => boolean | void) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
	let blocks = 0;

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType === Node.TEXT_NODE) {
			if (visit({ kind: "text", node: node as Text })) return;
			continue;
		}

		const el = node as HTMLElement;

		if (el.tagName === "BR") {
			const parent = el.parentNode;
			if (!parent) continue;

			const index = Array.prototype.indexOf.call(parent.childNodes, el) + 1;
			if (visit({ kind: "line", node: parent, offset: index })) return;
			continue;
		}

		// граница блоков — только между ними: перед первым строка ещё не кончалась
		if (el.parentNode === root && blockTypeOfTag(el.tagName)) {
			blocks++;
			if (blocks > 1 && visit({ kind: "line", node: el, offset: 0 })) return;
		}
	}
}

/**
 * Содержимое в тех же координатах, в которых считается каретка: концы строк — переводом строки.
 * Обычного `textContent` для этого мало — в нём переносов нет, и смещения по нему разъезжаются
 * со смещениями каретки ровно на число строк.
 */
export function editorText(root: HTMLElement): string {
	let text = "";
	walkChars(root, (unit) => {
		text += unit.kind === "text" ? unit.node.data : "\n";
	});

	return text;
}

/** Длина содержимого в координатах каретки (текст + концы строк внутри). */
export function charLength(root: HTMLElement): number {
	let length = 0;
	walkChars(root, (unit) => {
		length += unit.kind === "text" ? unit.node.length : 1;
	});

	return length;
}

/**
 * Пустой тег инструмента, внутри которого стоит каретка: слово из него стёрли, а тег остался,
 * и печать продолжится оформленной. Кнопка панели обязана снимать именно его.
 */
export function emptyFormatAt(root: HTMLElement, range: Range, tool: FormatTool): HTMLElement | null {
	if (!range.collapsed) return null;

	const found = formatAt(caretProbe(range), TOOL_TAG_SETS[tool], root);

	return found && !found.textContent ? found : null;
}

/**
 * Ближайший предок с буквальным содержимым (моноширинный) — в нём не живёт перенос строки:
 * значение берёт оттуда голый текст, и строка из значения пропала бы.
 */
export function literalAncestor(node: Node, root: HTMLElement): HTMLElement | null {
	return formatAt(node, LITERAL_TAG_SET, root);
}

/** Абсолютные текстовые смещения границ выделения внутри root (для восстановления после правок DOM). */
export function selectionCharBounds(root: HTMLElement, range: Range): [number, number] {
	const probe = document.createRange();
	probe.selectNodeContents(root);
	probe.setEnd(range.startContainer, range.startOffset);
	const text = probe.toString().length;
	const start = text + linesBefore(root, range.startContainer, range.startOffset);
	if (range.collapsed) return [start, start];

	// длину выделения меряем от его начала, а не от начала редактора: иначе весь текст
	// до каретки собирается в строку дважды
	probe.setStart(range.startContainer, range.startOffset);
	probe.setEnd(range.endContainer, range.endOffset);

	return [start, text + probe.toString().length + linesBefore(root, range.endContainer, range.endOffset)];
}

// Сколько концов строк уже пройдено к моменту точки: единица считается, если её позиция
// не позже самой точки. Строк на порядок меньше, чем символов, поэтому считаем их отдельно —
// текст быстрее собрать одной строкой, чем обходить по узлам.
function linesBefore(root: HTMLElement, container: Node, offset: number): number {
	const point = document.createRange();
	point.setStart(container, offset);
	point.collapse(true);

	let count = 0;
	walkChars(root, (unit) => {
		if (unit.kind === "text") return false;
		// единицы идут по порядку: встретили позицию за точкой — дальше только такие же
		if (point.comparePoint(unit.node, unit.offset) > 0) return true;

		count++;
		return false;
	});

	return count;
}

/**
 * Пересчитывает абсолютное текстовое смещение после нормализации пробелов.
 *
 * Нормализация только удаляет символы (схлопывает пробелы) и заменяет табы пробелами,
 * поэтому старый и новый текст выравниваются одним проходом: несовпадение означает
 * удалённый символ. Без пересчёта каретка отстаёт ровно на число схлопнутых перед ней
 * пробелов и может уехать в соседнее слово.
 */
export function mapCharOffset(before: string, after: string, offset: number): number {
	// Пробелом после нормализации становится и таб, и неразрывный пробел (U+00A0) — тот
	// браузер сам подставляет в contenteditable; без него выравнивание срывалось бы на
	// первом же nbsp, и каретка уезжала к нему.
	const same = (a: string, b: string) => a === b || (b === " " && (a === " " || a === "\t" || a === " "));

	let i = 0;
	let j = 0;
	while (i < offset && j < after.length) {
		if (same(before[i], after[j])) j++;
		i++;
	}
	return j;
}

type CharPosition = { node: Node; offset: number };

/**
 * Находит узлы и локальные смещения для пары абсолютных смещений за один обход.
 * Смещение за пределами содержимого прижимается к его концу.
 */
function locateChars(root: HTMLElement, lower: number, upper: number): [CharPosition, CharPosition] | null {
	let count = 0;
	let last: CharPosition | null = null;
	let low: CharPosition | null = null;
	let high: CharPosition | null = null;

	walkChars(root, (unit) => {
		if (unit.kind === "text") {
			const length = unit.node.length;

			// конец текстового узла — это конец строки, а не её начало: смещение, равное ему,
			// принадлежит тексту, а следующая позиция (+1) — уже переносу
			if (!low && count + length >= lower) low = { node: unit.node, offset: lower - count };
			if (count + length >= upper) {
				high = { node: unit.node, offset: upper - count };
				return true;
			}

			count += length;
			last = { node: unit.node, offset: length };
			return false;
		}

		count++;
		if (!low && count === lower) low = { node: unit.node, offset: unit.offset };
		if (count === upper) {
			high = { node: unit.node, offset: unit.offset };
			return true;
		}

		last = { node: unit.node, offset: unit.offset };
		return false;
	});

	// Содержимого нет вовсе — каретке место только в самом корне. Возвращать «некуда» нельзя:
	// в пустое поле как раз и вставляют, вернув каретку (панель смайликов работает без фокуса).
	const tail: CharPosition = last ?? { node: root, offset: 0 };

	return [low ?? tail, high ?? tail];
}

// Восстанавливает выделение по абсолютным текстовым смещениям (см. selectionCharBounds).
export function restoreSelection(root: HTMLElement, start: number, end: number, selection: Selection) {
	const forward = start <= end;
	const found = locateChars(root, forward ? start : end, forward ? end : start);
	if (!found) return;

	const [s, e] = forward ? found : [found[1], found[0]];

	const range = document.createRange();
	range.setStart(s.node, s.offset);
	range.setEnd(e.node, e.offset);
	selection.removeAllRanges();
	selection.addRange(range);
}

/** Разбивает пограничные текстовые узлы так, чтобы Range покрывал их целиком. */
function splitBoundaries(range: Range) {
	const sc = range.startContainer;
	const ec = range.endContainer;

	if (sc === ec && sc.nodeType === Node.TEXT_NODE) {
		const t = sc as Text;
		const s = range.startOffset;
		const e = range.endOffset;
		if (e < t.length) t.splitText(e);
		let target = t;
		if (s > 0) target = t.splitText(s);
		range.setStart(target, 0);
		range.setEnd(target, target.length);
		return;
	}

	if (ec.nodeType === Node.TEXT_NODE) {
		const t = ec as Text;
		if (range.endOffset > 0 && range.endOffset < t.length) {
			t.splitText(range.endOffset);
			range.setEnd(t, t.length);
		}
	}
	if (sc.nodeType === Node.TEXT_NODE) {
		const t = sc as Text;
		if (range.startOffset > 0 && range.startOffset < t.length) {
			const after = t.splitText(range.startOffset);
			range.setStart(after, 0);
		}
	}
}

function nodeWithinRange(node: Node, range: Range): boolean {
	const nr = document.createRange();
	nr.selectNodeContents(node);
	return (
		range.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 &&
		range.compareBoundaryPoints(Range.END_TO_END, nr) >= 0
	);
}

/**
 * Непустые текстовые узлы, задетые диапазоном. Единственный обход содержимого в модуле:
 * по нему работают и правки формата, и опрос состояния для панели.
 */
function* touchedTextNodes(root: HTMLElement, range: Range): Generator<Text> {
	const walker = document.createTreeWalker(rangeScope(root, range), NodeFilter.SHOW_TEXT);

	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
		if (!n.length || !range.intersectsNode(n)) continue;

		// Узел, задетый одной лишь границей, не входит в диапазон ни одним символом: выделение
		// кончается там, где он начинается, или начинается там, где он кончается. Учитывать его
		// нельзя — соседний по тексту узел лежит уже вне тегов выделенного, и от него состояние
		// всего выделения выглядело бы неотформатированным.
		if (range.startContainer === n && range.startOffset === n.length) continue;
		if (range.endContainer === n && range.endOffset === 0) continue;

		yield n;
	}
}

/**
 * Формат на самом узле или над ним. Каретка стоит и в самом теге — например в опустевшем `<code>`,
 * из которого стёрли слово: браузер держит её внутри, и печать продолжится оформленной, поэтому
 * состояние обязано этот тег видеть.
 */
function formatAt(node: Node, tags: ReadonlySet<string>, root: HTMLElement): HTMLElement | null {
	const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;
	if (el && el !== root && tags.has(el.tagName)) return el;

	return formatAncestor(node, tags, root);
}

/** Узел под схлопнутой кареткой — от него и ищется формат. */
function caretProbe(range: Range): Node {
	const node = range.startContainer;
	return node.nodeType === Node.TEXT_NODE ? node : (node.childNodes[range.startOffset] ?? node);
}

/**
 * Неделимый объект в тексте — элемент, объявленный нередактируемым (конструкции хоста:
 * переменная, рандомизация). Разметка обязана оборачивать его целиком: внутрь него ни каретка,
 * ни правка не заходят, а хост пересобирает его содержимое по-своему.
 */
function atomicAt(node: Node, root: HTMLElement): HTMLElement | null {
	const elem = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
	const atomic = elem?.closest<HTMLElement>(ATOMIC_SELECTOR) ?? null;

	// сам редактор бывает нередактируемым (disabled у хоста) — он объектом не является
	return atomic && atomic !== root && root.contains(atomic) ? atomic : null;
}

/**
 * Узлы правки: непустые текстовые узлы, целиком попавшие в диапазон (частично задетые правке
 * не подлежат), где текст внутри неделимого объекта заменён самим объектом.
 *
 * Иначе разметка ложилась бы внутрь конструкции, и вместо `**раз {ИМЯ} два**` в значение
 * уходило бы `**раз** **{ИМЯ}** **два**` — три отдельных куска вместо одного.
 */
function collectTargets(root: HTMLElement, range: Range): Node[] {
	const nodes: Node[] = [];
	const seen = new Set<Node>();

	// intersectsNode в обходе дешевле пары compareBoundaryPoints и отсекает почти всё лишнее
	for (const n of touchedTextNodes(root, range)) {
		if (!nodeWithinRange(n, range)) continue;

		const target = atomicAt(n, root) ?? n;
		if (seen.has(target)) continue;

		seen.add(target);
		nodes.push(target);
	}

	return nodes;
}

function wrapNode(node: Node, tag: string): HTMLElement {
	const wrapper = document.createElement(tag);
	node.parentNode?.insertBefore(wrapper, node);
	wrapper.appendChild(node);

	return wrapper;
}

/** Выносит node наружу из элемента fmt (расщепляя fmt на «до» и «после»). */
function unwrapAround(fmt: HTMLElement, node: Node) {
	const parent = fmt.parentNode;
	if (!parent) return;

	// Промежуточные предки расщепляются вокруг узла: ветка целиком несла бы наружу и чужой
	// текст — в <b><i>hello world</i></b> снятие жирного с «hello» уносило бы из <b> весь <i>,
	// и « world» терял бы формат, который с него не снимали.
	//
	// Осознанная цена: расщеплённая ссылка становится двумя <a> с одним адресом — в значении
	// два соседних куска вместо одного. Целая ссылка с чужим форматом снаружи стоила бы дороже:
	// формат снимался бы с текста, которого не выделяли.
	let child: Node = node;
	while (child.parentNode && child.parentNode !== fmt) {
		const holder = child.parentNode as HTMLElement;

		const left = holder.cloneNode(false) as HTMLElement;
		while (holder.firstChild && holder.firstChild !== child) left.appendChild(holder.firstChild);
		if (left.firstChild) holder.parentNode?.insertBefore(left, holder);

		if (child.nextSibling) {
			const right = holder.cloneNode(false) as HTMLElement;
			while (child.nextSibling) right.appendChild(child.nextSibling);
			holder.parentNode?.insertBefore(right, holder.nextSibling);
		}

		child = holder; // держит теперь только выносимую ветку
	}
	if (child.parentNode !== fmt) return;

	const left = fmt.cloneNode(false) as HTMLElement;
	while (fmt.firstChild && fmt.firstChild !== child) left.appendChild(fmt.firstChild);

	fmt.removeChild(child);
	parent.insertBefore(left, fmt);
	parent.insertBefore(child, fmt);

	if (!left.firstChild) parent.removeChild(left);
	if (!fmt.firstChild) parent.removeChild(fmt);
}

function removeFormatFromNode(node: Node, tags: ReadonlySet<string>, root: HTMLElement) {
	let fmt = formatAncestor(node, tags, root);
	while (fmt) {
		unwrapAround(fmt, node);
		fmt = formatAncestor(node, tags, root);
	}
}

function unwrapElement(el: HTMLElement) {
	const parent = el.parentNode;
	if (!parent) return;
	while (el.firstChild) parent.insertBefore(el.firstChild, el);
	parent.removeChild(el);
}

/**
 * Внутри моноширинного разметки нет — ни своей, ни чужой.
 *
 * Написанное в коде остаётся буквальным: значение берёт из него голый текст, и любое
 * форматирование внутри до получателя не доедет. Оставлять его в поле — показывать то,
 * чего в сообщении не будет, поэтому чистим сразу, а не при сохранении.
 */
function stripFormattingInCode(root: HTMLElement) {
	for (const code of Array.from(root.querySelectorAll<HTMLElement>(CODE_SELECTOR)))
		for (const el of Array.from(code.querySelectorAll<HTMLElement>(MATCH_SELECTOR))) unwrapElement(el);
}

/**
 * Один ли это формат у двух соседей. Тега для этого мало, когда формат несёт данные: у ссылки
 * их несёт адрес, и склеив соседние ссылки с разными адресами, редактор потерял бы второй,
 * ничего об этом не сказав.
 */
function sameFormat(a: HTMLElement, b: HTMLElement): boolean {
	if (a.tagName !== b.tagName) return false;

	return a.tagName !== "A" || a.getAttribute("href") === b.getAttribute("href");
}

/**
 * Чистит разметку: убирает пустые теги, схлопывает вложенные и соседние одинаковые, склеивает текст.
 *
 * Правка одного тега может сделать «грязными» его соседей и потомков, поэтому обход идёт очередью:
 * заново перебирается только затронутое, а не всё содержимое редактора. Вызывается на каждый символ
 * в режиме набора, поэтому повторные выборки по всему дереву тут заметны.
 */
export function cleanupFormatting(root: HTMLElement) {
	stripFormattingInCode(root);

	const queue: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>(FORMAT_SELECTOR));

	const enqueue = (node: Node | null | undefined) => {
		if (node && node.nodeType === Node.ELEMENT_NODE && FORMAT_TAG_SET.has((node as HTMLElement).tagName))
			queue.push(node as HTMLElement);
	};

	while (queue.length) {
		const el = queue.pop()!;
		if (!el.isConnected || !root.contains(el)) continue;

		// Тег без текста: оформлять в нём нечего. Разворачиваем, а не удаляем — внутри может
		// лежать перенос строки, и вместе с тегом он унёс бы разделение строк (снятие формата
		// с нескольких строк схлопывало их в одну). Пустой совсем — исчезнет и так.
		// После правки соседи могут стать смежными одинаковыми, а родитель — опустеть.
		if (el.textContent === "") {
			enqueue(el.nextSibling);
			enqueue(el.parentElement);
			unwrapElement(el);
			continue;
		}

		// вложен в такой же тег — разворачиваем, поднятые дети попадают в новое окружение
		const parent = el.parentElement;
		if (parent && parent !== root && parent.tagName === el.tagName) {
			const children = Array.from(el.children);
			enqueue(el.nextSibling);
			unwrapElement(el);
			children.forEach(enqueue);
			continue;
		}

		// соседний такой же формат слева — склеиваем
		const prev = el.previousSibling;
		if (prev && prev.nodeType === Node.ELEMENT_NODE && sameFormat(prev as HTMLElement, el)) {
			const children = Array.from(el.children);
			enqueue(el.nextSibling);
			enqueue(el.parentElement);
			while (el.firstChild) prev.appendChild(el.firstChild);
			el.remove();
			enqueue(prev);
			children.forEach(enqueue);
			continue;
		}
	}

	root.normalize();
}

/**
 * Каркас правки форматирования на выделении: доводит границы Range до целых текстовых узлов,
 * отдаёт строго попавшие узлы в `mutate` и восстанавливает выделение.
 *
 * По умолчанию восстанавливает выделение, на котором работал. Через `restoreBounds`
 * можно восстановить другое выделение (например, исходное до расширения до слова).
 */
function editSelection(
	root: HTMLElement,
	range: Range,
	selection: Selection,
	restoreBounds: [number, number] | undefined,
	mutate: (nodes: Node[]) => void
) {
	if (range.collapsed) return;

	const [startChar, endChar] = restoreBounds ?? selectionCharBounds(root, range);

	splitBoundaries(range);

	const nodes = collectTargets(root, range);
	if (!nodes.length) return;

	mutate(nodes);

	cleanupFormatting(root);
	restoreSelection(root, startChar, endChar, selection);
}

/**
 * Переключает форматирование инструмента на выделении.
 * Если весь выделенный текст уже отформатирован — снимает формат, иначе применяет.
 */
export function toggleFormat(
	root: HTMLElement,
	range: Range,
	tool: FormatTool,
	selection: Selection,
	restoreBounds?: [number, number]
) {
	const def = FORMAT_TOOLS[tool];
	const tags = TOOL_TAG_SETS[tool];

	editSelection(root, range, selection, restoreBounds, (nodes) => {
		const allFormatted = nodes.every((n) => formatAncestor(n, tags, root) !== null);
		if (allFormatted) {
			for (const n of nodes) removeFormatFromNode(n, tags, root);
		} else {
			for (const n of nodes) if (!formatAncestor(n, tags, root)) wrapNode(n, def.tag);
		}
	});
}

const LINK_TAGS = TOOL_TAG_SETS.link;

/**
 * Ссылка, внутри которой стоит каретка или начало выделения; null — выделение не в ссылке.
 * По ней панель узнаёт текущий адрес: у ссылки состояние — не «включена», а «вот этот адрес».
 */
export function linkAt(root: HTMLElement, range: Range): HTMLAnchorElement | null {
	// Пробой бывает и сам тег ссылки, а не текст внутри него: границы выделения встают на
	// элементы при Ctrl+A и selectAllContent — искать надо включая сам узел (см. formatAt).
	return formatAt(caretProbe(range), LINK_TAGS, root) as HTMLAnchorElement | null;
}

/**
 * Ставит ссылку на выделение или меняет адрес у той, в которой оно стоит; пустой адрес — снимает.
 *
 * Не переключатель, в отличие от {@link toggleFormat}: у ссылки есть данные, и повторное
 * применение с другим адресом — это правка, а не снятие. Снятие выражается пустым адресом.
 */
export function applyLink(
	root: HTMLElement,
	range: Range,
	url: string,
	selection: Selection,
	restoreBounds?: [number, number]
) {
	editSelection(root, range, selection, restoreBounds, (nodes) => {
		for (const node of nodes) {
			const existing = formatAncestor(node, LINK_TAGS, root);

			if (!url) {
				if (existing) removeFormatFromNode(node, LINK_TAGS, root);
				continue;
			}

			// Уже в ссылке — меняем адрес у неё целиком: разрезать её ради части выделения значит
			// сделать из одной ссылки две, а просили поправить адрес.
			if (existing) existing.setAttribute("href", url);
			else wrapNode(node, "a").setAttribute("href", url);
		}
	});
}

/** Снимает всё форматирование с выделения (все инструменты сразу, включая теги-синонимы). */
export function clearFormat(root: HTMLElement, range: Range, selection: Selection, restoreBounds?: [number, number]) {
	editSelection(root, range, selection, restoreBounds, (nodes) => {
		for (const n of nodes) removeFormatFromNode(n, MATCH_TAG_SET, root);
	});
}

/** Снимает всё форматирование со всего содержимого (выделение не участвует). */
export function clearAllFormat(root: HTMLElement) {
	// вложенные элементы после разворачивания родителя остаются в дереве — снимок обходим целиком
	for (const el of Array.from(root.querySelectorAll<HTMLElement>(MATCH_SELECTOR))) unwrapElement(el);

	root.normalize();
}

/** Есть ли форматирование хоть на части выделения (или под кареткой) — доступность кнопки очистки. */
export function hasFormatting(root: HTMLElement, range: Range): boolean {
	if (range.collapsed) return formatAncestor(caretProbe(range), MATCH_TAG_SET, root) !== null;

	for (const node of touchedTextNodes(root, range)) if (formatAncestor(node, MATCH_TAG_SET, root)) return true;

	return false;
}

/**
 * Инструменты, которыми отформатировано всё выделение, — за один обход вместо обхода
 * на каждый инструмент. Панель опрашивает это состояние на каждое движение каретки.
 */
export function activeFormats(root: HTMLElement, range: Range, tools: FormatTool[]): Set<FormatTool> {
	const active = new Set<FormatTool>();
	if (!tools.length) return active;

	if (range.collapsed) {
		const probe = caretProbe(range);
		for (const tool of tools) if (formatAt(probe, TOOL_TAG_SETS[tool], root)) active.add(tool);

		return active;
	}

	// инструмент остаётся кандидатом, пока каждый задетый узел им отформатирован
	const pending = new Set(tools);
	let found = false;

	for (const node of touchedTextNodes(root, range)) {
		found = true;
		for (const tool of pending) if (!formatAncestor(node, TOOL_TAG_SETS[tool], root)) pending.delete(tool);
		if (!pending.size) break; // все выбыли — дальше смотреть нечего
	}

	// пустое выделение не считается «отформатированным целиком»
	if (found) for (const tool of pending) active.add(tool);

	return active;
}

/** Есть ли форматирование хоть где-то в содержимом. */
export function hasAnyFormatting(root: HTMLElement): boolean {
	return root.querySelector(MATCH_SELECTOR) !== null;
}

/**
 * Вставляет текст в позицию каретки, оборачивая его в указанные форматы (режим набора).
 * Каретка ставится сразу после вставленного текста; соседние одинаковые теги склеиваются.
 */
export function insertFormattedText(
	root: HTMLElement,
	data: string,
	tools: FormatTool[],
	selection: Selection,
	href = ""
) {
	if (!data || selection.rangeCount === 0) return;

	const range = selection.getRangeAt(0);
	const caret = selectionCharBounds(root, range)[0];

	range.deleteContents();

	let node: Node = document.createTextNode(data);
	for (const tool of tools) {
		const el = document.createElement(FORMAT_TOOLS[tool].tag);
		// Ссылка — не просто тег: без адреса она не переживёт сериализацию. Адрес передаёт
		// вызывающий — с выделения, чьё оформление наследуется.
		if (tool === "link" && href) el.setAttribute("href", href);
		el.appendChild(node);
		node = el;
	}
	range.insertNode(node);

	cleanupFormatting(root);

	const offset = caret + data.length;
	restoreSelection(root, offset, offset, selection);
}

/** Активен ли формат инструмента на текущем выделении (для подсветки одиночной кнопки). */
export function isFormatActive(root: HTMLElement, range: Range, tool: FormatTool): boolean {
	return activeFormats(root, range, [tool]).has(tool);
}
