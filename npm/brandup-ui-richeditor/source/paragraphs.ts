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
 */
export function normalizeParagraphs(root: HTMLElement) {
	for (const el of Array.from(root.children)) {
		// Пустой блок другого типа не трогаем: его завели осознанно и в него сейчас будут писать,
		// а пустая строка внутри кода вообще осмысленна сама по себе.
		if (blockTypeOf(el) === DEFAULT_BLOCK && (el.textContent ?? "").trim() === "") el.remove();
	}
}

/**
 * Нормализует верхний уровень редактора к абзацам <p>: блуждающие текст/инлайн оборачиваются в <p>,
 * <div> заменяются на <p>, пустые абзацы получают <br>-заполнитель (чтобы строка была видимой).
 */
export function ensureParagraphs(root: HTMLElement) {
	let run: ChildNode[] = [];

	const flushRun = (before: Node | null) => {
		if (!run.length) return;
		const block = document.createElement(BLOCK_TYPES[DEFAULT_BLOCK].tag);
		for (const node of run) block.appendChild(node);
		root.insertBefore(block, before);
		run = [];
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
			}
		} else {
			run.push(node);
		}
	}
	flushRun(null);

	for (const p of Array.from(root.children) as HTMLElement[]) {
		if (!p.firstChild) {
			p.appendChild(document.createElement("br")); // пустой абзац — заполнитель для видимости строки
			continue;
		}

		// в непустом абзаце убираем краевые <br>-заполнители: иначе введённый текст
		// оказывается рядом с лишним переносом (символ «съезжает» на новую строку).
		// Внутренние <br> (мягкие переносы) сохраняются.
		if ((p.textContent ?? "").length > 0) {
			while (p.firstChild && p.firstChild.nodeName === "BR") p.removeChild(p.firstChild);
			while (p.lastChild && p.lastChild.nodeName === "BR") p.removeChild(p.lastChild);
		}
	}
}
