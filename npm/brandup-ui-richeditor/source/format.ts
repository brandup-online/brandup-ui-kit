// Форматирование текста (жирный, курсив, зачёркивание, подчёркивание) для RichEditor:
// разбор/сериализация значения (HTML | Markdown), переключение формата на выделении
// и вставка форматированного текста на чистом Selection/Range API (без execCommand).

export type FormatTool = "bold" | "italic" | "strike" | "underline";
export type FormatStorage = "html" | "markdown";

export const ALL_FORMAT_TOOLS: FormatTool[] = ["bold", "italic", "strike", "underline"];

interface FormatToolDef {
	/** Имя команды (атрибут command у кнопки и registerCommand). */
	command: string;
	/** Канонический тег при оборачивании и сериализации. */
	tag: string;
	/** Теги, распознаваемые при разборе входного HTML. */
	matchTags: string[];
	/** Маркер в Markdown. */
	md: string;
	/** Клавиша для Ctrl/Cmd-хоткея (пусто — без хоткея). */
	hotkey: string;
	/** Подсказка на кнопке. */
	title: string;
}

export const FORMAT_TOOLS: Record<FormatTool, FormatToolDef> = {
	bold: {
		command: "format-bold",
		tag: "b",
		matchTags: ["B", "STRONG"],
		md: "**",
		hotkey: "b",
		title: "Жирный",
	},
	italic: {
		command: "format-italic",
		tag: "i",
		matchTags: ["I", "EM"],
		md: "*",
		hotkey: "i",
		title: "Курсив",
	},
	strike: {
		command: "format-strike",
		tag: "s",
		matchTags: ["S", "STRIKE", "DEL"],
		md: "~~",
		hotkey: "",
		title: "Зачёркнутый",
	},
	underline: {
		command: "format-underline",
		tag: "u",
		matchTags: ["U", "INS"],
		md: "++",
		hotkey: "u",
		title: "Подчёркнутый",
	},
};

/** Канонические теги форматирования (в верхнем регистре, как tagName). */
const FORMAT_TAG_NAMES = ALL_FORMAT_TOOLS.map((t) => FORMAT_TOOLS[t].tag.toUpperCase());

/** Markdown-маркер для каждого инструмента форматирования. */
export type FormatMarkers = Record<FormatTool, string>;

/** Маркеры по умолчанию (из FORMAT_TOOLS): bold=**, italic=*, strike=~~, underline=++. */
export function defaultFormatMarkers(): FormatMarkers {
	const markers = {} as FormatMarkers;
	for (const tool of ALL_FORMAT_TOOLS) markers[tool] = FORMAT_TOOLS[tool].md;
	return markers;
}

/** Карта Ctrl/Cmd-хоткеев: клавиша → инструмент. */
export const HOTKEY_TOOLS: Record<string, FormatTool> = (() => {
	const map: Record<string, FormatTool> = {};
	for (const tool of ALL_FORMAT_TOOLS) {
		const hotkey = FORMAT_TOOLS[tool].hotkey;
		if (hotkey) map[hotkey] = tool;
	}
	return map;
})();

/** Разбирает значение атрибута data-format-tools, оставляя только известные инструменты. */
export function parseFormatTools(value: string | null): FormatTool[] {
	if (value === null) return ALL_FORMAT_TOOLS.slice();

	const tools = value
		.split(/\s+/)
		.filter(Boolean)
		.filter((t): t is FormatTool => (ALL_FORMAT_TOOLS as string[]).includes(t));

	// убираем дубли, сохраняя порядок объявления
	return ALL_FORMAT_TOOLS.filter((t) => tools.includes(t));
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Тег → инструмент, только для включённых инструментов. */
function buildTagMap(tools: FormatTool[]): Record<string, FormatTool> {
	const map: Record<string, FormatTool> = {};
	for (const tool of tools) for (const tag of FORMAT_TOOLS[tool].matchTags) map[tag] = tool;
	return map;
}

function lineBreak(storage: FormatStorage): string {
	return storage === "html" ? "<br>" : "\n";
}

function wrap(storage: FormatStorage, tool: FormatTool, inner: string, markers: FormatMarkers): string {
	if (!inner) return inner;

	const def = FORMAT_TOOLS[tool];
	if (storage === "html") return `<${def.tag}>${inner}</${def.tag}>`;

	const marker = markers[tool];
	return `${marker}${inner}${marker}`;
}

// Сериализует инлайновое содержимое (текст, форматирование, <br> как мягкий перенос).
// Абзацы (<p>/<div>) на этом уровне не учитываются — их разбирает serializeParagraphs.
function serializeInline(
	nodes: ArrayLike<ChildNode>,
	storage: FormatStorage,
	tagMap: Record<string, FormatTool>,
	markers: FormatMarkers
): string {
	let result = "";

	for (const node of Array.from(nodes)) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? "";
			result += storage === "html" ? escapeHtml(text) : text;
			continue;
		}

		if (node.nodeType !== Node.ELEMENT_NODE) continue;

		const el = node as HTMLElement;
		const tag = el.tagName;

		if (tag === "BR") {
			result += lineBreak(storage); // мягкий перенос
			continue;
		}

		const inner = serializeInline(el.childNodes, storage, tagMap, markers);

		// вложенный блочный элемент (нестандарт) — без обёртки, просто содержимое
		if (tag === "DIV" || tag === "P") {
			result += inner;
			continue;
		}

		const tool = tagMap[tag];
		// неизвестный или отключённый тег — отбрасываем обёртку, оставляем текст
		result += tool ? wrap(storage, tool, inner, markers) : inner;
	}

	return result;
}

// Хвостовые переносы абзаца отбрасываем — это <br>-заполнители, делающие последнюю строку видимой;
// мягкий перенос осмыслен только между содержимым (для пустой строки используйте новый абзац).
function trimTrailingBreaks(inline: string, storage: FormatStorage): string {
	return storage === "html" ? inline.replace(/(?:<br>)+$/, "") : inline.replace(/\n+$/, "");
}

// Разбивает верхний уровень на абзацы: <p>/<div> — отдельный абзац, остальное — неявный абзац.
// HTML: <p>содержимое</p>; Markdown/Plain: абзацы через \n\n, мягкие переносы внутри — \n.
function serializeParagraphs(
	root: ParentNode,
	storage: FormatStorage,
	tagMap: Record<string, FormatTool>,
	markers: FormatMarkers
): string {
	const paragraphs: string[] = [];
	let buffer: ChildNode[] = [];

	const flush = () => {
		if (buffer.length) paragraphs.push(serializeInline(buffer, storage, tagMap, markers));
		buffer = [];
	};

	for (const node of Array.from(root.childNodes)) {
		const isBlock =
			node.nodeType === Node.ELEMENT_NODE &&
			((node as Element).tagName === "P" || (node as Element).tagName === "DIV");

		if (isBlock) {
			flush();
			paragraphs.push(serializeInline((node as Element).childNodes, storage, tagMap, markers));
		} else {
			buffer.push(node);
		}
	}
	flush();

	const cleaned = paragraphs.map((p) => trimTrailingBreaks(p, storage));

	if (storage === "html") return cleaned.map((p) => `<p>${p}</p>`).join("");
	return cleaned.join("\n\n");
}

/**
 * Сериализует содержимое редактора в строку для хранения. Сохраняются только включённые инструменты.
 * При paragraphs=true применяется модель «абзацы (<p>/\n\n) + мягкие переносы (<br>/\n)».
 */
export function serialize(
	root: HTMLElement,
	storage: FormatStorage,
	tools: FormatTool[],
	markers: FormatMarkers = defaultFormatMarkers(),
	paragraphs = false
): string {
	const tagMap = buildTagMap(tools);

	if (paragraphs) return serializeParagraphs(root, storage, tagMap, markers).trim();

	const inline = serializeInline(root.childNodes, storage, tagMap, markers);
	if (storage === "html")
		return inline
			.replace(/^(?:<br>)+/, "")
			.replace(/(?:<br>)+$/, "")
			.trim();
	return inline.replace(/^\n+/, "").replace(/\n+$/, "").trim();
}

// Markdown-разметка одного абзаца → инлайновый HTML (escape, \n→<br>, маркеры).
function markdownInline(text: string, tools: FormatTool[], markers: FormatMarkers): string {
	let html = escapeHtml(text).replace(/\r?\n/g, "<br>");

	// Маркеры применяем по убыванию длины: длинный (**) раньше короткого-префикса (*).
	const order = tools.slice().sort((a, b) => markers[b].length - markers[a].length);
	for (const tool of order) {
		const marker = markers[tool];
		if (!marker) continue;

		const def = FORMAT_TOOLS[tool];
		const escaped = escapeRegExp(marker);
		const re = new RegExp(`${escaped}([\\s\\S]+?)${escaped}`, "g");
		html = html.replace(re, `<${def.tag}>$1</${def.tag}>`);
	}

	return html;
}

/**
 * Готовит сохранённое значение к отображению в редакторе (возвращает HTML).
 * При paragraphs=true строит <p>-абзацы; HTML-значения санитизируются до разрешённых тегов,
 * Markdown/Plain — разбивается на абзацы по \n\n (мягкий перенос \n → <br>).
 */
export function deserialize(
	value: string,
	storage: FormatStorage,
	tools: FormatTool[],
	markers: FormatMarkers = defaultFormatMarkers(),
	paragraphs = false
): string {
	if (!value) return "";

	if (storage === "markdown") {
		if (!paragraphs) return markdownInline(value, tools, markers);
		return value
			.split(/\n{2,}/)
			.map((p) => `<p>${markdownInline(p, tools, markers) || "<br>"}</p>`)
			.join("");
	}

	// html: парсим и пересобираем, отбрасывая всё, кроме разрешённых тегов
	const template = document.createElement("template");
	template.innerHTML = value;
	const tagMap = buildTagMap(tools);

	if (!paragraphs) return serializeInline(template.content.childNodes, "html", tagMap, defaultFormatMarkers());

	return serializeParagraphs(template.content, "html", tagMap, defaultFormatMarkers()).replace(
		/<p><\/p>/g,
		"<p><br></p>"
	);
}

// --- Переключение форматирования на выделении (Selection/Range API, без execCommand) ---

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

function collectTextNodes(root: HTMLElement, range: Range, strict: boolean): Text[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let n = walker.nextNode() as Text | null;
	while (n) {
		if (n.length > 0 && (strict ? nodeWithinRange(n, range) : range.intersectsNode(n))) nodes.push(n);
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
function cleanupFormatting(root: HTMLElement) {
	const selector = FORMAT_TAG_NAMES.join(",").toLowerCase();

	let changed = true;
	while (changed) {
		changed = false;

		for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
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
 * Переключает форматирование инструмента на выделении.
 * Если весь выделенный текст уже отформатирован — снимает формат, иначе применяет.
 *
 * По умолчанию восстанавливает выделение, на котором работал. Через `restoreBounds`
 * можно восстановить другое выделение (например, исходное до расширения до слова).
 */
export function toggleFormat(
	root: HTMLElement,
	range: Range,
	tool: FormatTool,
	selection: Selection,
	restoreBounds?: [number, number]
) {
	if (range.collapsed) return;

	const def = FORMAT_TOOLS[tool];
	const tags = def.matchTags;
	const [startChar, endChar] = restoreBounds ?? selectionCharBounds(root, range);

	splitBoundaries(range);

	const nodes = collectTextNodes(root, range, true);
	if (!nodes.length) return;

	const allFormatted = nodes.every((n) => formatAncestor(n, tags, root) !== null);
	if (allFormatted) {
		for (const n of nodes) removeFormatFromNode(n, tags, root);
	} else {
		for (const n of nodes) if (!formatAncestor(n, tags, root)) wrapTextNode(n, def.tag);
	}

	cleanupFormatting(root);
	restoreSelection(root, startChar, endChar, selection);
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
	const tags = FORMAT_TOOLS[tool].matchTags;

	if (range.collapsed) {
		const node = range.startContainer;
		const probe = node.nodeType === Node.TEXT_NODE ? node : (node.childNodes[range.startOffset] ?? node);
		return formatAncestor(probe, tags, root) !== null;
	}

	const nodes = collectTextNodes(root, range, false);
	if (!nodes.length) return false;
	return nodes.every((n) => formatAncestor(n, tags, root) !== null);
}

/**
 * Нормализует пробелы в редакторе: схлопывает повторяющиеся пробелы/табы в один
 * и обрезает пробелы по краям каждой строки. BR и блочные элементы (DIV/P) —
 * границы строк; инлайновое форматирование (b/i/s/u) на строки не влияет.
 */
export function normalizeWhitespace(root: HTMLElement) {
	type Item = { kind: "text"; node: Text } | { kind: "break" };
	const items: Item[] = [];

	const flatten = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				items.push({ kind: "text", node: child as Text });
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				if (el.tagName === "BR") {
					items.push({ kind: "break" });
				} else if (el.tagName === "DIV" || el.tagName === "P") {
					items.push({ kind: "break" });
					flatten(el);
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
				pendingSpaceNode.data = pendingSpaceNode.data.replace(/ $/, "");
				pendingSpaceNode = null;
			}
			atLineStart = true;
			continue;
		}

		let text = item.node.data.replace(/[ \t]+/g, " ");
		if (atLineStart) text = text.replace(/^ /, ""); // пробел в начале строки
		if (pendingSpaceNode && text.startsWith(" ")) text = text.slice(1); // двойной пробел на границе узлов

		item.node.data = text;
		if (text.length === 0) continue;

		atLineStart = false;
		pendingSpaceNode = text.endsWith(" ") ? item.node : null;
	}

	if (pendingSpaceNode) pendingSpaceNode.data = pendingSpaceNode.data.replace(/ $/, ""); // хвост последней строки

	cleanupFormatting(root); // убрать опустевшие теги, склеить узлы
}

/**
 * Нормализует верхний уровень редактора к абзацам <p>: блуждающие текст/инлайн оборачиваются в <p>,
 * <div> заменяются на <p>, пустые абзацы получают <br>-заполнитель (чтобы строка была видимой).
 */
export function ensureParagraphs(root: HTMLElement) {
	let run: ChildNode[] = [];

	const flushRun = (before: Node | null) => {
		if (!run.length) return;
		const p = document.createElement("p");
		for (const node of run) p.appendChild(node);
		root.insertBefore(p, before);
		run = [];
	};

	for (const node of Array.from(root.childNodes)) {
		const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;

		if (el && (el.tagName === "P" || el.tagName === "DIV")) {
			flushRun(node);
			if (el.tagName === "DIV") {
				const p = document.createElement("p");
				while (el.firstChild) p.appendChild(el.firstChild);
				root.replaceChild(p, el);
			}
		} else {
			run.push(node);
		}
	}
	flushRun(null);

	for (const p of Array.from(root.querySelectorAll("p"))) {
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
