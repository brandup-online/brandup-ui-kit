export { default } from "./textbox";
export * from "./textbox";

// реэкспорт типов/утилит форматирования из @brandup/ui-richeditor для обратной совместимости
export {
	ALL_EDITOR_ACTIONS,
	ALL_FORMAT_TOOLS,
	EDITOR_ACTIONS,
	FORMAT_TOOLS,
	parseEditorActions,
	parseFormatTools,
	defaultFormatMarkers,
	normalizeWhitespace,
	type EditorAction,
	type FormatTool,
	type FormatStorage,
	type FormatMarkers,
} from "@brandup/ui-richeditor";
