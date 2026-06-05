// Баррель форматирования — единая точка импорта. Реализация разнесена по модулям:
//   format-config — типы, набор инструментов, markdown-маркеры, хоткеи
//   serialize     — разбор/сериализация значения (HTML | Markdown), абзацы и переносы
//   selection     — переключение формата на выделении и вставка текста (Selection/Range)
//   paragraphs    — нормализация пробелов и приведение к абзацам <p>

export {
	ALL_FORMAT_TOOLS,
	FORMAT_TOOLS,
	HOTKEY_TOOLS,
	defaultFormatMarkers,
	parseFormatTools,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
} from "./format-config";
export { serialize, deserialize } from "./serialize";
export { selectionCharBounds, restoreSelection, toggleFormat, insertFormattedText, isFormatActive } from "./selection";
export { normalizeWhitespace, normalizeParagraphs, ensureParagraphs } from "./paragraphs";
