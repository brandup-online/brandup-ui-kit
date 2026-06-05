// Конфигурация форматирования: типы, набор инструментов, markdown-маркеры и Ctrl/Cmd-хоткеи.

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
