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

/** Ближайший предок-элемент с одним из тегов (в пределах root, не включая root). */
function formatAncestor(node: Node, tags: string[], root: HTMLElement): HTMLElement | null {
	let el = node.parentElement;
	while (el && el !== root) {
		if (tags.includes(el.tagName)) return el;
		el = el.parentElement;
	}
	return null;
}

/** Абсолютные текстовые смещения границ выделения внутри root (для восстановления после правок DOM). */
export function selectionCharBounds(root: HTMLElement, range: Range): [number, number] {
	const probe = document.createRange();
	probe.selectNodeContents(root);
	probe.setEnd(range.startContainer, range.startOffset);
	const start = probe.toString().length;
	probe.setEnd(range.endContainer, range.endOffset);
	const end = probe.toString().length;
	return [start, end];
}

/** Находит текстовый узел и локальное смещение по абсолютному текстовому смещению. */
function locateChar(root: HTMLElement, target: number): { node: Text; offset: number } | null {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let count = 0;
	let last: Text | null = null;
	let n = walker.nextNode() as Text | null;
	while (n) {
		last = n;
		if (count + n.length >= target) return { node: n, offset: Math.max(0, target - count) };
		count += n.length;
		n = walker.nextNode() as Text | null;
	}
	return last ? { node: last, offset: last.length } : null;
}

// Восстанавливает выделение по абсолютным текстовым смещениям (см. selectionCharBounds).
export function restoreSelection(root: HTMLElement, start: number, end: number, selection: Selection) {
	const s = locateChar(root, start);
	const e = locateChar(root, end);
	if (!s || !e) return;

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

/** Непустые текстовые узлы, целиком попавшие в диапазон (частично задетые правке не подлежат). */
function collectTextNodes(root: HTMLElement, range: Range): Text[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let n = walker.nextNode() as Text | null;
	while (n) {
		if (n.length > 0 && nodeWithinRange(n, range)) nodes.push(n);
		n = walker.nextNode() as Text | null;
	}
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

function removeFormatFromNode(node: Text, tags: string[], root: HTMLElement) {
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

/** Чистит разметку: убирает пустые теги, схлопывает вложенные и соседние одинаковые, склеивает текст. */
export function cleanupFormatting(root: HTMLElement) {
	let changed = true;
	while (changed) {
		changed = false;

		for (const el of Array.from(root.querySelectorAll<HTMLElement>(FORMAT_SELECTOR))) {
			if (!el.isConnected) continue;

			// пустой тег
			if (el.textContent === "") {
				el.remove();
				changed = true;
				continue;
			}

			// вложен в такой же тег
			const parent = el.parentElement;
			if (parent && parent !== root && parent.tagName === el.tagName) {
				unwrapElement(el);
				changed = true;
				continue;
			}

			// соседний такой же тег слева — склеиваем
			const prev = el.previousSibling;
			if (prev && prev.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).tagName === el.tagName) {
				while (el.firstChild) prev.appendChild(el.firstChild);
				el.remove();
				changed = true;
				continue;
			}
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
	const tags = def.matchTags;

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
		for (const n of nodes) removeFormatFromNode(n, MATCH_TAG_NAMES, root);
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
function rangeFormatState(root: HTMLElement, range: Range, tags: string[], mode: "every" | "some"): boolean {
	if (range.collapsed) {
		const node = range.startContainer;
		const probe = node.nodeType === Node.TEXT_NODE ? node : (node.childNodes[range.startOffset] ?? node);
		return formatAncestor(probe, tags, root) !== null;
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let found = false;

	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
		if (!n.length || !range.intersectsNode(n)) continue;

		const formatted = formatAncestor(n, tags, root) !== null;
		if (mode === "some") {
			if (formatted) return true;
		} else if (!formatted) return false;

		found = true;
	}

	// every: пустое выделение — не «отформатировано целиком»; some: ни одного форматированного узла
	return mode === "every" && found;
}

/** Есть ли форматирование на выделении (или под кареткой) — для доступности кнопки очистки. */
export function hasFormatting(root: HTMLElement, range: Range): boolean {
	return rangeFormatState(root, range, MATCH_TAG_NAMES, "some");
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

/** Активен ли формат инструмента на текущем выделении (для подсветки кнопки). */
export function isFormatActive(root: HTMLElement, range: Range, tool: FormatTool): boolean {
	return rangeFormatState(root, range, FORMAT_TOOLS[tool].matchTags, "every");
}
