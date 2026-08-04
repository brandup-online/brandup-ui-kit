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

	// Маркер не сработает, если содержимое начинается или заканчивается пробелом, — ни у нас
	// при разборе, ни у мессенджера. Выносим краевые пробелы наружу: разметка сохраняется,
	// а иначе получатель увидел бы сами маркеры.
	const leading = /^\s*/.exec(inner)![0];
	const trailing = /\s*$/.exec(inner.slice(leading.length))![0];
	const core = inner.slice(leading.length, inner.length - trailing.length);
	if (!core) return inner; // одни пробелы — оборачивать нечего

	return `${leading}${marker}${core}${marker}${trailing}`;
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

/**
 * Маркеры в порядке применения: длинный (`**`) раньше короткого-префикса (`*`), иначе
 * короткий съест половину длинного. Считается один раз на разбор — `markdownInline`
 * вызывается на каждый абзац.
 */
function orderedMarkers(tools: FormatTool[], markers: FormatMarkers): Array<[FormatTool, string]> {
	return tools
		.filter((tool) => markers[tool])
		.sort((a, b) => markers[b].length - markers[a].length)
		.map((tool) => [tool, markers[tool]]);
}

// Markdown-разметка одного абзаца → инлайновый HTML (escape, маркеры, \n→<br>).
function markdownInline(text: string, order: Array<[FormatTool, string]>): string {
	let html = escapeHtml(text);

	for (const [tool, marker] of order) {
		const def = FORMAT_TOOLS[tool];
		html = html.replace(markerPattern(marker), `$1<${def.tag}>$2</${def.tag}>`);
	}

	// переносы — после маркеров: пока это \n, запрет на пересечение строки работает
	return html.replace(/\r?\n/g, "<br>");
}

/**
 * Разметка распознаётся по правилам мессенджеров: маркер стоит на границе слова, содержимое
 * не начинается и не заканчивается пробелом и не пересекает перенос строки. Иначе `5**4 = 20`
 * или `2 ** 2 ** 2` превращались бы в текст с форматированием, которого получатель не увидит.
 *
 * Граница — всё, что не буква и не цифра (включая `_`). Именно `\p{L}\p{N}`, а не `\W`:
 * в JavaScript `\w` — только ASCII, поэтому с `\W` каждая кириллическая буква считалась бы
 * границей и `файл_имя_файла` разбирался бы как разметка.
 *
 * Левая граница захватывается группой и возвращается на место — lookbehind не используется,
 * его нет в Safari до 16.4.
 */
function markerPattern(marker: string): RegExp {
	let pattern = markerPatterns.get(marker);
	if (pattern) return pattern;

	const escaped = escapeRegExp(marker);
	const boundary = "[^\\p{L}\\p{N}]";

	pattern = new RegExp(`(^|${boundary})${escaped}(\\S|\\S[^\\n]*?\\S)${escaped}(?=$|${boundary})`, "gu");
	markerPatterns.set(marker, pattern);

	return pattern;
}

// Набор маркеров за разбор не меняется, а разбор идёт по абзацам — компилируем каждую
// регулярку один раз. Флаг `g` переиспользовать безопасно: `replace` сбрасывает lastIndex.
const markerPatterns = new Map<string, RegExp>();

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
		const order = orderedMarkers(tools, markers);

		if (!paragraphs) return markdownInline(value, order);
		return value
			.split(/\n{2,}/)
			.map((p) => `<p>${markdownInline(p, order) || "<br>"}</p>`)
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
