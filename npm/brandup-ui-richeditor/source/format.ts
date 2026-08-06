// Баррель форматирования — единая точка импорта. Реализация разнесена по модулям:
//   format-config — типы, набор инструментов, markdown-маркеры, хоткеи
//   serialize     — разбор/сериализация значения (HTML | Markdown), абзацы и переносы
//   selection     — переключение формата на выделении и вставка текста (Selection/Range)
//   paragraphs    — нормализация пробелов и приведение к абзацам <p>

export {
	ALL_BLOCK_TYPES,
	ALL_EDITOR_ACTIONS,
	ALL_FORMAT_TOOLS,
	BLOCK_TYPES,
	DEFAULT_BLOCK,
	EDITOR_ACTIONS,
	FORMAT_TOOLS,
	HOTKEY_TOOLS,
	defaultFormatMarkers,
	normalizeBlockTypes,
	parseBlockTypes,
	parseEditorActions,
	parseFormatTools,
	type BlockType,
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
	editorText,
	charLength,
	restoreSelection,
	mapCharOffset,
	activeFormats,
	emptyFormatAt,
	toggleFormat,
	clearFormat,
	clearAllFormat,
	hasFormatting,
	hasAnyFormatting,
	insertFormattedText,
	isFormatActive,
} from "./selection";
export {
	isBlock,
	blockAt,
	blockTypeOf,
	blocksInRange,
	createBlock,
	normalizeWhitespace,
	mergeAdjacentBlocks,
	normalizeParagraphs,
	ensureParagraphs,
} from "./paragraphs";
