// Конфигурация форматирования: типы, набор инструментов, markdown-маркеры и Ctrl/Cmd-хоткеи.

export type FormatTool = "bold" | "italic" | "strike" | "underline" | "spoiler" | "code" | "link";
export type FormatStorage = "html" | "markdown";

/**
 * Что делает Enter в многострочном режиме.
 *
 * `block` — новый абзац (`<p>`, в markdown `\n\n`); модификатор даёт мягкий перенос.
 * `break` — мягкий перенос (`<br>`, в markdown `\n`), как в мессенджерах: абзац там набирается
 * двумя переносами. Без этого каждый Enter уезжал бы в хранилище пустой строкой.
 */
export type ParagraphMode = "block" | "break";

/** Действие редактора (не формат): вставка смайлика, очистка форматирования, отмена и повтор. */
export type EditorAction = "emoji" | "erase" | "undo" | "redo";

/**
 * Тип блока верхнего уровня. Обычный абзац — такой же тип, а не «тип не задан»: тогда
 * и разбор, и печать, и переключение в панели работают одинаково для всех блоков.
 */
export type BlockType = "paragraph" | "quote" | "code";

export const ALL_BLOCK_TYPES: BlockType[] = ["paragraph", "quote", "code"];

/** Куда попадает содержимое, не попавшее ни в какой блок: вставка, чужой `<div>`, блуждающий текст. */
export const DEFAULT_BLOCK: BlockType = "paragraph";

interface BlockDef {
	/** Канонический тег при построении и сериализации. */
	tag: string;
	/** Теги, распознаваемые при разборе входного HTML. */
	matchTags: string[];
	/** Подсказка на кнопке панели. */
	title: string;
	/**
	 * Маркер в начале каждой строки блока (цитата). Подряд идущие строки с ним — один блок:
	 * так эту разметку понимают и мессенджеры.
	 */
	linePrefix?: string;
	/** Ограждение блока целиком (код): строка до и строка после содержимого. */
	fence?: string;
	/**
	 * Размечается ли содержимое инлайновыми инструментами. У кода нет: написанное в нём
	 * буквально таким и остаётся — как и внутри моноширинного.
	 */
	inline: boolean;
	/**
	 * Что делает Enter внутри: `paragraph` — заканчивает блок (хвост уходит в обычный текст),
	 * `break` — переносит строку. Модификатор делает обратное.
	 */
	enter: "paragraph" | "break";
}

export const BLOCK_TYPES: Record<BlockType, BlockDef> = {
	paragraph: {
		tag: "p",
		matchTags: ["P", "DIV"],
		title: "Обычный текст",
		inline: true,
		enter: "paragraph",
	},
	quote: {
		tag: "blockquote",
		matchTags: ["BLOCKQUOTE"],
		title: "Цитата",
		linePrefix: "> ",
		inline: true,
		// Enter заканчивает цитату, строка внутри — Shift+Enter: выход нужен чаще, чем
		// продолжение, а уйти из блока иначе можно только мышью.
		enter: "paragraph",
	},
	code: {
		tag: "pre",
		matchTags: ["PRE"],
		title: "Блок кода",
		fence: "```",
		inline: false,
		enter: "paragraph",
	},
};

// Тег → тип блока. Собирается один раз: спрашивается на каждый узел верхнего уровня и на каждую
// единицу обхода координат каретки.
const BLOCK_TAGS: Record<string, BlockType> = (() => {
	const map: Record<string, BlockType> = {};
	for (const type of ALL_BLOCK_TYPES) for (const tag of BLOCK_TYPES[type].matchTags) map[tag] = type;
	return map;
})();

/** Тип блока по имени тега (как `tagName`, в верхнем регистре); null — тег не блочный. */
export function blockTypeOfTag(tagName: string): BlockType | null {
	return BLOCK_TAGS[tagName] ?? null;
}

export const ALL_FORMAT_TOOLS: FormatTool[] = ["bold", "italic", "strike", "underline", "spoiler", "code", "link"];

export const ALL_EDITOR_ACTIONS: EditorAction[] = ["emoji", "erase", "undo", "redo"];

interface FormatToolDef {
	/** Канонический тег при оборачивании и сериализации. */
	tag: string;
	/** Теги, распознаваемые при разборе входного HTML. */
	matchTags: string[];
	/** Маркер в Markdown. */
	md: string;
	/**
	 * Маркеры того же инструмента из чужих диалектов: разбираются наравне с основным, но сами
	 * не ставятся. Текст, размеченный ими, встречается в старых сообщениях, и показывать его
	 * сырыми символами — значит показывать не то, что увидит получатель.
	 */
	mdAliases?: string[];
	/**
	 * Содержимое буквально: разметка внутри не разбирается и не сохраняется, значение берёт
	 * оттуда голый текст. Перенос строки в таком теге тоже не живёт — он его разрезает.
	 */
	literal?: boolean;
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
		// Одинарная звёздочка — жирный в WhatsApp; так размечены сообщения, набранные до
		// редактора, и получатель увидит их жирными.
		mdAliases: ["*"],
		hotkey: "b",
		title: "Жирный",
	},
	italic: {
		tag: "i",
		matchTags: ["I", "EM"],
		md: "_",
		hotkey: "i",
		title: "Курсив",
	},
	strike: {
		tag: "s",
		matchTags: ["S", "STRIKE", "DEL"],
		md: "~",
		hotkey: "",
		title: "Зачёркнутый",
	},
	underline: {
		tag: "u",
		matchTags: ["U", "INS"],
		md: "__",
		hotkey: "u",
		title: "Подчёркнутый",
	},
	spoiler: {
		// Своего элемента для скрытого текста в HTML нет. Берём собственный тег, а разбирать
		// умеем и телеграмный: значения приходят и из его разметки.
		tag: "spoiler",
		matchTags: ["SPOILER", "TG-SPOILER"],
		md: "||",
		hotkey: "",
		title: "Спойлер",
	},
	code: {
		tag: "code",
		matchTags: ["CODE"],
		md: "`",
		literal: true,
		hotkey: "",
		title: "Моноширинный",
	},
	link: {
		tag: "a",
		matchTags: ["A"],
		// Не парный маркер: адрес отдельной частью и в тексте не показывается. Пустой маркер
		// выводит инструмент из маркерной машинерии (см. orderedMarkers в ./serialize), разбор
		// и сборку он делает своими ветками — как и переносы с абзацами.
		md: "",
		hotkey: "k",
		title: "Ссылка",
	},
};

interface EditorActionDef {
	/** Подсказка на кнопке. */
	title: string;
}

export const EDITOR_ACTIONS: Record<EditorAction, EditorActionDef> = {
	emoji: { title: "Вставить смайлик" },
	erase: { title: "Очистить форматирование" },
	undo: { title: "Отменить (Ctrl+Z)" },
	redo: { title: "Повторить (Ctrl+Y)" },
};

/** Markdown-маркер для каждого инструмента форматирования. */
export type FormatMarkers = Record<FormatTool, string>;

/** Маркеры по умолчанию (из FORMAT_TOOLS): bold=**, italic=_, strike=~, underline=__, spoiler=||, code=`. */
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

/**
 * Разбирает значение атрибута data-blocks. Без атрибута доступны все типы; пустое значение
 * оставляет только обычный текст — им ограничивают поле, где цитаты и код ни к чему.
 */
export function parseBlockTypes(value: string | null): BlockType[] {
	return value === null ? ALL_BLOCK_TYPES.slice() : normalizeBlockTypes(parseList(value, ALL_BLOCK_TYPES));
}

/**
 * Приводит набор типов к порядку объявления. Обычный текст в наборе есть всегда: им становится
 * содержимое, не попавшее ни в какой блок, и в него же блок возвращают. Набор не задан — берём
 * все типы; ограничивают их явным списком.
 */
export function normalizeBlockTypes(types: BlockType[] | undefined): BlockType[] {
	if (!types) return ALL_BLOCK_TYPES.slice();

	const list = ALL_BLOCK_TYPES.filter((type) => types.includes(type));

	return list.includes(DEFAULT_BLOCK) ? list : [DEFAULT_BLOCK, ...list];
}
