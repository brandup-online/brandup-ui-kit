export { default } from "./textbox";
export * from "./textbox";

// реэкспорт типов/утилит форматирования из @brandup/ui-richeditor для обратной совместимости
export {
	ALL_FORMAT_TOOLS,
	FORMAT_TOOLS,
	parseFormatTools,
	defaultFormatMarkers,
	normalizeWhitespace,
	type FormatTool,
	type FormatStorage,
	type FormatMarkers,
} from "@brandup/ui-richeditor";
