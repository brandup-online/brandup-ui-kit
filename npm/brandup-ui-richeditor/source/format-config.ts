// Конфигурация форматирования: типы, набор инструментов, markdown-маркеры и Ctrl/Cmd-хоткеи.

export type FormatTool = "bold" | "italic" | "strike" | "underline";
export type FormatStorage = "html" | "markdown";

/** Действие редактора (не формат): очистка форматирования, отмена и повтор. */
export type EditorAction = "erase" | "undo" | "redo";

export const ALL_FORMAT_TOOLS: FormatTool[] = ["bold", "italic", "strike", "underline"];

export const ALL_EDITOR_ACTIONS: EditorAction[] = ["erase", "undo", "redo"];

interface FormatToolDef {
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
		tag: "b",
		matchTags: ["B", "STRONG"],
		md: "**",
		hotkey: "b",
		title: "Жирный",
	},
	italic: {
		tag: "i",
		matchTags: ["I", "EM"],
		md: "*",
		hotkey: "i",
		title: "Курсив",
	},
	strike: {
		tag: "s",
		matchTags: ["S", "STRIKE", "DEL"],
		md: "~~",
		hotkey: "",
		title: "Зачёркнутый",
	},
	underline: {
		tag: "u",
		matchTags: ["U", "INS"],
		md: "++",
		hotkey: "u",
		title: "Подчёркнутый",
	},
};

interface EditorActionDef {
	/** Подсказка на кнопке. */
	title: string;
}

export const EDITOR_ACTIONS: Record<EditorAction, EditorActionDef> = {
	erase: { title: "Очистить форматирование" },
	undo: { title: "Отменить (Ctrl+Z)" },
	redo: { title: "Повторить (Ctrl+Y)" },
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

// Разбор атрибута-списка через пробел: оставляет только известные значения,
// убирает дубли и восстанавливает порядок объявления.
function parseList<T extends string>(value: string, known: T[]): T[] {
	const parsed = value.split(/\s+/).filter(Boolean);
	return known.filter((item) => parsed.includes(item));
}

/** Разбирает значение атрибута data-format-tools; отсутствие атрибута — все инструменты. */
export function parseFormatTools(value: string | null): FormatTool[] {
	return value === null ? ALL_FORMAT_TOOLS.slice() : parseList(value, ALL_FORMAT_TOOLS);
}

/**
 * Разбирает значение атрибута data-editor-actions. В отличие от инструментов,
 * действия подключаются явно: отсутствие атрибута — пустой набор.
 */
export function parseEditorActions(value: string | null): EditorAction[] {
	return value === null ? [] : parseList(value, ALL_EDITOR_ACTIONS);
}
