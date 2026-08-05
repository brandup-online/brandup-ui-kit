// Баррель форматирования — единая точка импорта. Реализация разнесена по модулям:
//   format-config — типы, набор инструментов, markdown-маркеры, хоткеи
//   serialize     — разбор/сериализация значения (HTML | Markdown), абзацы и переносы
//   selection     — переключение формата на выделении и вставка текста (Selection/Range)
//   paragraphs    — нормализация пробелов и приведение к абзацам <p>

export {
	ALL_EDITOR_ACTIONS,
	ALL_FORMAT_TOOLS,
	EDITOR_ACTIONS,
	FORMAT_TOOLS,
	HOTKEY_TOOLS,
	defaultFormatMarkers,
	parseEditorActions,
	parseFormatTools,
	type EditorAction,
	type FormatMarkers,
	type FormatStorage,
	type ParagraphMode,
	type FormatTool,
} from "./format-config";
export { serialize, deserialize } from "./serialize";
export {
	documentSelection,
	innerSelection,
	preserveCaret,
	selectionCharBounds,
	restoreSelection,
	mapCharOffset,
	activeFormats,
	toggleFormat,
	clearFormat,
	clearAllFormat,
	hasFormatting,
	hasAnyFormatting,
	insertFormattedText,
	isFormatActive,
} from "./selection";
export { isBlock, normalizeWhitespace, normalizeParagraphs, ensureParagraphs } from "./paragraphs";
