// Разбор и сериализация значения редактора (HTML | Markdown), модель абзацев и мягких переносов.

import {
	FORMAT_TOOLS,
	defaultFormatMarkers,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
} from "./format-config";

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
