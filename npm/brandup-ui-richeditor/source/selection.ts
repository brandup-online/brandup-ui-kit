// Переключение форматирования на выделении и вставка форматированного текста
// на чистом Selection/Range API (без execCommand), плюс сохранение/восстановление выделения.

import { ALL_FORMAT_TOOLS, FORMAT_TOOLS, type FormatTool } from "./format-config";

/** Канонические теги форматирования (в верхнем регистре, как tagName). */
const FORMAT_TAG_NAMES = ALL_FORMAT_TOOLS.map((t) => FORMAT_TOOLS[t].tag.toUpperCase());

// Все распознаваемые теги форматирования (канонические и синонимы) — для снятия форматирования
// целиком: в содержимом редактора синонимов быть не должно, но вставка и setValue могут их принести.
const MATCH_TAG_NAMES = Array.from(new Set(ALL_FORMAT_TOOLS.flatMap((t) => FORMAT_TOOLS[t].matchTags)));

// Селекторы считаем один раз: обе выборки идут на каждую правку формата и на каждое обновление панели.
const FORMAT_SELECTOR = FORMAT_TAG_NAMES.join(",").toLowerCase();
const MATCH_SELECTOR = MATCH_TAG_NAMES.join(",").toLowerCase();

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

/** Абсолютные текстовые смещения границ выделения внутри root (для восстановления после правок DOM). */
export function selectionCharBounds(root: HTMLElement, range: Range): [number, number] {
	const probe = document.createRange();
	probe.selectNodeContents(root);
	probe.setEnd(range.startContainer, range.startOffset);
	const start = probe.toString().length;
	if (range.collapsed) return [start, start];

	// длину выделения меряем от его начала, а не от начала редактора: иначе весь текст
	// до каретки собирается в строку дважды
	probe.setStart(range.startContainer, range.startOffset);
	probe.setEnd(range.endContainer, range.endOffset);
	return [start, start + probe.toString().length];
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
	const same = (a: string, b: string) => a === b || (b === " " && (a === " " || a === "\t"));

	let i = 0;
	let j = 0;
	while (i < offset && j < after.length) {
		if (same(before[i], after[j])) j++;
		i++;
	}
	return j;
}

type CharPosition = { node: Text; offset: number };

/**
 * Находит текстовые узлы и локальные смещения для пары абсолютных смещений за один обход.
 * Смещение за пределами текста прижимается к его концу.
 */
function locateChars(root: HTMLElement, lower: number, upper: number): [CharPosition, CharPosition] | null {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let count = 0;
	let last: Text | null = null;
	let low: CharPosition | null = null;
	let high: CharPosition | null = null;

	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
		last = n;
		if (!low && count + n.length >= lower) low = { node: n, offset: lower - count };
		if (count + n.length >= upper) {
			high = { node: n, offset: upper - count };
			break;
		}
		count += n.length;
	}

	if (!last) return null;

	const tail: CharPosition = { node: last, offset: last.length };
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

/** Узел под схлопнутой кареткой — от него и ищется формат. */
function caretProbe(range: Range): Node {
	const node = range.startContainer;
	return node.nodeType === Node.TEXT_NODE ? node : (node.childNodes[range.startOffset] ?? node);
}

/** Непустые текстовые узлы, целиком попавшие в диапазон (частично задетые правке не подлежат). */
function collectTextNodes(root: HTMLElement, range: Range): Text[] {
	const nodes: Text[] = [];
	// intersectsNode в обходе дешевле пары compareBoundaryPoints и отсекает почти всё лишнее
	for (const n of touchedTextNodes(root, range)) if (nodeWithinRange(n, range)) nodes.push(n);

	return nodes;
}

function wrapTextNode(node: Text, tag: string) {
	const wrapper = document.createElement(tag);
	node.parentNode?.insertBefore(wrapper, node);
	wrapper.appendChild(node);
}

/** Выносит ветку, содержащую node, наружу из элемента fmt (расщепляя fmt на «до» и «после»). */
function unwrapAround(fmt: HTMLElement, node: Node) {
	const parent = fmt.parentNode;
	if (!parent) return;

	let child: Node = node;
	while (child.parentNode && child.parentNode !== fmt) child = child.parentNode;
	if (child.parentNode !== fmt) return;

	const left = fmt.cloneNode(false) as HTMLElement;
	while (fmt.firstChild && fmt.firstChild !== child) left.appendChild(fmt.firstChild);

	fmt.removeChild(child);
	parent.insertBefore(left, fmt);
	parent.insertBefore(child, fmt);

	if (!left.firstChild) parent.removeChild(left);
	if (!fmt.firstChild) parent.removeChild(fmt);
}

function removeFormatFromNode(node: Text, tags: ReadonlySet<string>, root: HTMLElement) {
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
 * Чистит разметку: убирает пустые теги, схлопывает вложенные и соседние одинаковые, склеивает текст.
 *
 * Правка одного тега может сделать «грязными» его соседей и потомков, поэтому обход идёт очередью:
 * заново перебирается только затронутое, а не всё содержимое редактора. Вызывается на каждый символ
 * в режиме набора, поэтому повторные выборки по всему дереву тут заметны.
 */
export function cleanupFormatting(root: HTMLElement) {
	const queue: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>(FORMAT_SELECTOR));

	const enqueue = (node: Node | null | undefined) => {
		if (node && node.nodeType === Node.ELEMENT_NODE && FORMAT_TAG_SET.has((node as HTMLElement).tagName))
			queue.push(node as HTMLElement);
	};

	while (queue.length) {
		const el = queue.pop()!;
		if (!el.isConnected || !root.contains(el)) continue;

		// пустой тег: после удаления его соседи могут стать смежными одинаковыми,
		// а родитель — опустеть
		if (el.textContent === "") {
			enqueue(el.nextSibling);
			enqueue(el.parentElement);
			el.remove();
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

		// соседний такой же тег слева — склеиваем
		const prev = el.previousSibling;
		if (prev && prev.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).tagName === el.tagName) {
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
	mutate: (nodes: Text[]) => void
) {
	if (range.collapsed) return;

	const [startChar, endChar] = restoreBounds ?? selectionCharBounds(root, range);

	splitBoundaries(range);

	const nodes = collectTextNodes(root, range);
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
			for (const n of nodes) if (!formatAncestor(n, tags, root)) wrapTextNode(n, def.tag);
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

/**
 * Состояние форматирования на выделении указанными тегами.
 * `every` — отформатирован весь текст (подсветка кнопки инструмента),
 * `some` — отформатирована хоть какая-то часть (доступность очистки).
 * Обход прерывается на первом узле, решающем исход.
 */
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
		for (const tool of tools) if (formatAncestor(probe, TOOL_TAG_SETS[tool], root)) active.add(tool);

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
export function insertFormattedText(root: HTMLElement, data: string, tools: FormatTool[], selection: Selection) {
	if (!data || selection.rangeCount === 0) return;

	const range = selection.getRangeAt(0);
	const caret = selectionCharBounds(root, range)[0];

	range.deleteContents();

	let node: Node = document.createTextNode(data);
	for (const tool of tools) {
		const el = document.createElement(FORMAT_TOOLS[tool].tag);
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
