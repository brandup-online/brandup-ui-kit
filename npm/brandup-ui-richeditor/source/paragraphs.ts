// Нормализация содержимого редактора: схлопывание пробелов по строкам и приведение
// верхнего уровня к абзацам <p> (модель многострочного режима).

import { cleanupFormatting } from "./selection";
import { BLOCK_TYPES, DEFAULT_BLOCK, blockTypeOfTag, type BlockType } from "./format-config";

/**
 * Что в содержимом редактора считается блоком. Единственное определение модели: по нему идут
 * и разбор с сериализацией, и правки каретки, и нормализация. `<div>` признаём наравне с `<p>` —
 * его приносят вставка и чужой contenteditable, а нормализация приводит к `<p>`.
 */
export function isBlock(node: Node): boolean {
	return blockTypeOf(node) !== null;
}

/** Тип блока по элементу; null — не блок верхнего уровня. */
export function blockTypeOf(node: Node | null | undefined): BlockType | null {
	if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;

	return blockTypeOfTag((node as Element).tagName);
}

/** Блок, в котором лежит узел (обычно якорь выделения), в пределах редактора. */
export function blockAt(root: HTMLElement, node: Node | null | undefined): HTMLElement | null {
	let current: Node | null = node ?? null;
	while (current && current !== root) {
		if (current.parentNode === root && isBlock(current)) return current as HTMLElement;
		current = current.parentNode;
	}

	return null;
}

/**
 * Блоки, которых касается диапазон, по порядку. Границы берём по их блокам, а не перебором
 * с проверкой пересечения: свёрнутая каретка на стыке пересекает сразу два соседних блока,
 * и правка уходила бы в лишний.
 */
export function blocksInRange(root: HTMLElement, range: Range): HTMLElement[] {
	// Контейнером может быть и сам редактор — тогда позиция адресует ребёнка по номеру.
	// Позиция — это место ПЕРЕД ребёнком, поэтому конец выделения относится к предыдущему
	// блоку: иначе правка захватывала бы блок, из которого не выделено ни символа.
	const edge = (container: Node, offset: number, end: boolean): HTMLElement | null => {
		const own = blockAt(root, container);
		if (own) return own;
		if (container !== root) return null;

		const index = end && offset > 0 ? offset - 1 : offset;
		const child = root.childNodes[index] ?? root.lastChild;

		return blockAt(root, child) ?? (isBlock(child as Node) ? (child as HTMLElement) : null);
	};

	const first = edge(range.startContainer, range.startOffset, false);
	if (!first) return [];

	const last = edge(range.endContainer, range.endOffset, !range.collapsed) ?? first;

	const blocks: HTMLElement[] = [];
	for (let el: HTMLElement | null = first; el; el = el.nextElementSibling as HTMLElement | null) {
		if (isBlock(el)) blocks.push(el);
		if (el === last) return blocks;
	}

	// Конца не встретили — он лежит раньше начала (диапазон собран вручную и вывернут).
	// Берём один блок: пройтись до конца содержимого значило бы править всё подряд.
	return [first];
}

/** Пустой блок нужного типа с заполнителем: без него строка не видна и в неё не встать кареткой. */
export function createBlock(type: BlockType): HTMLElement {
	const block = document.createElement(BLOCK_TYPES[type].tag);
	block.appendChild(document.createElement("br"));

	return block;
}

// Пробел, таб и неразрывный пробел (U+00A0) — всё это «пробел» при наборе; см. normalizeWhitespace.
// После схлопывания в тексте остаются только обычные пробелы, поэтому дальше по коду хватает " ".
const SPACE_RUN = /[ \t\u00A0]+/g;

/**
 * Нормализует пробелы в редакторе: схлопывает повторяющиеся пробелы/табы в один
 * и обрезает пробелы по краям каждой строки. BR и блочные элементы (DIV/P) —
 * границы строк; инлайновое форматирование (b/i/s/u) на строки не влияет.
 *
 * Неразрывный пробел (U+00A0) считается обычным: браузер сам подставляет его в contenteditable
 * вместо пробела, который иначе схлопнулся бы при отображении. Без этого набранные подряд
 * пробелы не схлопывались бы вовсе, а U+00A0 уезжал бы в сохраняемое значение.
 */
export function normalizeWhitespace(root: HTMLElement) {
	type Item = { kind: "text"; node: Text } | { kind: "break" };
	const items: Item[] = [];

	// Присваивание Text.data — это «replace data» по всему узлу, а оно схлопывает границы
	// живых Range внутри узла в его начало: каретка уезжает в начало строки. Нормализация
	// чаще всего ничего не меняет (вызывается на blur), поэтому пишем только при отличии.
	const setData = (node: Text, text: string) => {
		if (node.data !== text) node.data = text;
	};

	const flatten = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				items.push({ kind: "text", node: child as Text });
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				if (el.tagName === "BR") {
					items.push({ kind: "break" });
				} else if (isBlock(el)) {
					// у блока без инлайновой разметки (код) пробелы значимы: отступы там — часть текста
					const type = blockTypeOf(el);
					items.push({ kind: "break" });
					if (!type || BLOCK_TYPES[type].inline) flatten(el);
					items.push({ kind: "break" });
				} else {
					flatten(el); // инлайновый тег — не разрывает строку
				}
			}
		}
	};
	flatten(root);

	let atLineStart = true;
	let pendingSpaceNode: Text | null = null; // узел, заканчивающийся пробелом (возможно хвостовым)

	for (const item of items) {
		if (item.kind === "break") {
			if (pendingSpaceNode) {
				setData(pendingSpaceNode, pendingSpaceNode.data.replace(/ $/, ""));
				pendingSpaceNode = null;
			}
			atLineStart = true;
			continue;
		}

		let text = item.node.data.replace(SPACE_RUN, " ");
		if (atLineStart) text = text.replace(/^ /, ""); // пробел в начале строки
		if (pendingSpaceNode && text.startsWith(" ")) text = text.slice(1); // двойной пробел на границе узлов

		setData(item.node, text);
		if (text.length === 0) continue;

		atLineStart = false;
		pendingSpaceNode = text.endsWith(" ") ? item.node : null;
	}

	if (pendingSpaceNode) setData(pendingSpaceNode, pendingSpaceNode.data.replace(/ $/, "")); // хвост последней строки

	cleanupFormatting(root); // убрать опустевшие теги, склеить узлы
}

/**
 * Нормализует абзацы многострочного режима: удаляет пустые абзацы (без текстового содержимого).
 * Если содержимого нет вовсе — редактор остаётся пустым (показывается placeholder).
 *
 * В режиме мягких переносов (`softBreaks`) абзац — это строка: пустой абзац там осмыслен сам по
 * себе (пустая строка сообщения) и не удаляется, а мягкий перенос внутри абзаца приводится
 * к той же модели — делит его на строки-абзацы.
 */
export function normalizeParagraphs(root: HTMLElement, softBreaks = false) {
	if (softBreaks) {
		mergeAdjacentBlocks(root);
		splitSoftBreaks(root);

		// Пустая строка здесь осмысленна сама по себе, поэтому пустые абзацы не удаляются —
		// кроме случая, когда всё поле из них и состоит: в значение они не идут (хвост
		// обрезается), а пока они в поле, оно не пустое и не покажет заглушку.
		const lines = Array.from(root.children);
		const blank = (el: Element) => blockTypeOf(el) === DEFAULT_BLOCK && !(el.textContent ?? "").trim();
		if (lines.length && lines.every(blank)) for (const el of lines) el.remove();

		return;
	}

	for (const el of Array.from(root.children)) {
		// Пустой блок другого типа не трогаем: его завели осознанно и в него сейчас будут писать,
		// а пустая строка внутри кода вообще осмысленна сама по себе.
		if (blockTypeOf(el) !== DEFAULT_BLOCK || (el.textContent ?? "").trim() !== "") continue;

		// Последний пустой абзац — это место, где оставили каретку: перенеслись на новую строку
		// и ушли из поля. Убрав его, редактор схлопывал бы только что набранную строку. За блоком
		// другого типа он к тому же единственное место вне цитаты или кода — без него правка
		// запиралась бы внутри, хотя вышли оттуда как раз затем, чтобы писать дальше.
		//
		// В значение такой абзац не попадает (хвост обрезается), а единственный в поле — попадает
		// под удаление: пустое поле должно оставаться пустым, иначе не покажется заглушка.
		const previous = el.previousElementSibling;
		const kept = previous && (!el.nextElementSibling || blockTypeOf(previous) !== DEFAULT_BLOCK);
		if (kept) continue;

		el.remove();
	}
}

/**
 * Склеивает соседние блоки одного типа — в режиме мягких переносов, где граница между ними
 * в значение не попадает: подряд идущие строки с маркером цитаты разбор собирает в одну цитату,
 * и два блока в поле показывали бы то, чего в сообщении не будет.
 *
 * Обычные абзацы не трогаем: там граница блоков — это перевод строки, и она в значение как раз
 * попадает. Блоки с ограждением (код) — тоже: у них есть свои границы, и два подряд разбираются
 * ровно как два.
 */
export function mergeAdjacentBlocks(root: HTMLElement) {
	for (const el of Array.from(root.children) as HTMLElement[]) {
		const type = blockTypeOf(el);
		if (!type || type === DEFAULT_BLOCK || BLOCK_TYPES[type].fence) continue;

		const previous = el.previousElementSibling;
		if (!previous || blockTypeOf(previous) !== type) continue;

		// Строки склеиваем переносом: между блоками была граница, а внутри блока её роль играет он.
		// Если перенос там уже есть (заполнитель последней строки), он границей и станет — иначе
		// между строками появилась бы пустая, которой на экране не было.
		if (previous.lastChild?.nodeName !== "BR") previous.appendChild(document.createElement("br"));

		while (el.firstChild) previous.appendChild(el.firstChild);
		el.remove();
	}
}

/**
 * Делит обычные абзацы по мягким переносам — в режиме, где абзац это строка. Собственный перенос
 * приходит извне (вставка документа, чужое значение), и без деления одна строка модели была бы
 * то `<br>`, то границей абзацев.
 *
 * Хвостовой перенос строкой не считается: это заполнитель, которым браузер показывает последнюю
 * пустую строку (см. ensureParagraphs), — от него делить нечего.
 */
export function splitSoftBreaks(root: HTMLElement) {
	for (const el of Array.from(root.children) as HTMLElement[]) {
		if (blockTypeOf(el) !== DEFAULT_BLOCK) continue;

		const parts: ChildNode[][] = [[]];
		for (const node of Array.from(el.childNodes)) {
			if (node.nodeName === "BR") parts.push([]);
			else parts[parts.length - 1].push(node);
		}
		if (parts.length === 1) continue;

		// Перенос, спрятанный внутри инлайнового тега (мягкий перенос его не разрезает), делит
		// строки наравне с верхним, но по границам тега — с ним и хвостовой перенос абзаца уже
		// не обязательно заполнитель. Такой абзац оставляем как есть: делить его по половине
		// переносов значило бы терять строки.
		if (el.querySelectorAll("br").length !== parts.length - 1) continue;

		const empty = (nodes: ChildNode[]) => !nodes.some((node) => node.textContent);
		if (empty(parts[parts.length - 1])) parts.pop();

		el.replaceWith(
			...parts.map((nodes) => {
				const p = document.createElement(BLOCK_TYPES[DEFAULT_BLOCK].tag);
				for (const node of nodes) p.appendChild(node);
				if (empty(nodes)) p.appendChild(document.createElement("br")); // заполнитель пустой строки

				return p;
			})
		);
	}
}

/**
 * Есть ли что нормализовать {@link ensureParagraphs}: блуждающий текст/инлайн, чужой `<div>`,
 * пустой абзац без заполнителя или лишний хвостовой перенос.
 *
 * Проверка зеркалит правки ensureParagraphs и существует ради горячего пути: нормализация
 * вызывается на каждое нажатие клавиши, а сохранение каретки вокруг неё собирает весь текст
 * в строку. Почти всегда менять нечего — и дешёвый осмотр верхнего уровня позволяет не платить
 * ни за снимок каретки, ни за сравнение содержимого.
 */
export function paragraphsNormalized(root: HTMLElement): boolean {
	for (const node of root.childNodes) {
		const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;
		if (!el || !isBlock(el) || el.tagName === "DIV") return false;
		if (!(el.textContent ?? "") && !el.querySelector("br")) return false;

		const tail = el.lastChild!;
		if (tail.nodeName === "BR" && tail.previousSibling?.nodeName !== "BR" && (el.textContent ?? "").length > 0)
			return false;
	}

	return true;
}

/**
 * Нормализует верхний уровень редактора к абзацам <p>: блуждающие текст/инлайн оборачиваются в <p>,
 * <div> заменяются на <p>, пустые абзацы получают <br>-заполнитель (чтобы строка была видимой).
 *
 * Возвращает, менялось ли содержимое: если нет — выделение живо, и переставлять его не нужно.
 */
export function ensureParagraphs(root: HTMLElement): boolean {
	let changed = false;
	let run: ChildNode[] = [];

	const flushRun = (before: Node | null) => {
		if (!run.length) return;
		const block = document.createElement(BLOCK_TYPES[DEFAULT_BLOCK].tag);
		for (const node of run) block.appendChild(node);
		root.insertBefore(block, before);
		run = [];
		changed = true;
	};

	for (const node of Array.from(root.childNodes)) {
		const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;

		if (el && isBlock(el)) {
			flushRun(node);
			// `<div>` — тот же абзац, только чужой: приводим к каноническому тегу.
			// Блоки других типов оставляем как есть, их завели осознанно.
			if (el.tagName === "DIV") {
				const p = document.createElement(BLOCK_TYPES[DEFAULT_BLOCK].tag);
				while (el.firstChild) p.appendChild(el.firstChild);
				root.replaceChild(p, el);
				changed = true;
			}
		} else {
			run.push(node);
		}
	}
	flushRun(null);

	for (const p of Array.from(root.children) as HTMLElement[]) {
		// Пустой абзац опознаём по содержимому, а не по наличию узлов: из буфера обмена приходят
		// абзацы из одних пробелов, и после обрезки в них остаются пустые текстовые узлы. Без
		// заполнителя такой абзац не занимает строки, и в режиме мягких переносов склейка теряет
		// его вместе с пустой строкой между абзацами (см. mergeAdjacentBlocks).
		if (!(p.textContent ?? "") && !p.querySelector("br")) {
			p.appendChild(document.createElement("br")); // пустой абзац — заполнитель для видимости строки
			changed = true;
			continue;
		}

		// Хвостовой перенос в одиночку — остаток заполнителя опустевшего абзаца: текст уже есть,
		// а показывать за ним нечего. Два и больше — это набранные пустые строки плюс заполнитель,
		// который их и делает видимыми (см. trimTrailingBreaks), и трогать их нельзя.
		//
		// Ведущие переносы не трогаем вовсе: заполнитель бывает только последним, а перенос
		// в начале — это набранная пустая строка. Убрав его, редактор схлопывал бы её, стоило
		// начать печатать в следующей.
		if ((p.textContent ?? "").length > 0) {
			const tail = p.lastChild;
			if (tail?.nodeName === "BR" && tail.previousSibling?.nodeName !== "BR") {
				p.removeChild(tail);
				changed = true;
			}
		}
	}

	return changed;
}
