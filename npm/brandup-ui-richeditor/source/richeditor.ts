import "./richeditor.less"; // стили редактора и панели форматирования

import { DOM, UIElementBound } from "@brandup/ui";
import { IS_TOUCH_DEVICE, PopupManager } from "@brandup/ui-kit";
import {
	ALL_FORMAT_TOOLS,
	BLOCK_TYPES,
	DEFAULT_BLOCK,
	HOTKEY_TOOLS,
	activeFormats,
	blockAt,
	blockTypeOf,
	blocksInRange,
	clearAllFormat,
	clearFormat,
	defaultFormatMarkers,
	deserialize,
	ensureParagraphs,
	hasAnyFormatting,
	hasFormatting,
	insertFormattedText,
	isFormatActive,
	documentSelection,
	emptyFormatAt,
	innerSelection,
	mapCharOffset,
	normalizeBlockTypes,
	editorText,
	charLength,
	paragraphsNormalized,
	preserveCaret,
	mergeAdjacentBlocks,
	splitSoftBreaks,
	normalizeParagraphs,
	normalizeWhitespace,
	restoreSelection,
	selectionCharBounds,
	serialize,
	toggleFormat,
	applyLink as applyLinkTo,
	linkAt,
	type BlockType,
	type EditorAction,
	type FormatMarkers,
	type FormatStorage,
	type ParagraphMode,
	type FormatTool,
} from "./format";
import {
	applyBlocks,
	atBlockStart,
	buildParagraphs,
	caretToEnd,
	collapseEmptyEdges,
	expandRangeToWords,
	hasPastedMarkup,
	isDocumentHtml,
	insertParagraph,
	insertPastedParagraphs,
	insertSoftBreak,
	parsePastedMarkdown,
	sanitizePastedHtml,
	selectAllContent,
	trimSelectionWhitespace,
} from "./editing";
import { EditorHistory } from "./history";
import { refreshRecentEmojis } from "./emoji";
import { formatToolbar, TOOLBAR_CLASS, type ToolbarButton } from "./toolbar";

export { formatToolbar, TOOLBAR_CLASS, type ToolbarHost, type ToolbarButton } from "./toolbar";

export const ROOT_CLASS = "ui-richeditor"; // редактируемый элемент, к нему привязан UIElement
// Содержимое временно невыделяемо: по странице тянут выделение, начатое вне редактора (см. __holdSelectable).
export const UNSELECTABLE_CLASS = "unselectable";
// Режим мягких переносов: абзац — это строка, и отступов между абзацами в нём нет.
export const BREAKS_CLASS = "breaks";
export const CHANGE_EVENT = "richeditor-change";

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Escape"];

// Код — единственное, что есть и инструментом, и типом блока: имя одно на оба (см. applyCode).
const CODE = "code";

// Расширения текстовых файлов для броска в редактор: у .md и .txt тип в системе часто
// не зарегистрирован и приходит пустым — тогда решает имя.
const TEXT_FILE_NAME = /\.(md|markdown|txt|text)$/i;

/** Текстовый ли файл: по MIME (text/*), а без типа — по расширению. */
function isTextFile(file: File): boolean {
	return file.type ? file.type.startsWith("text/") : TEXT_FILE_NAME.test(file.name);
}

/** Содержимое файла текстом: Blob.text() есть не во всех окружениях (jsdom) — тогда FileReader. */
function readFileText(file: File): Promise<string> {
	if (typeof file.text === "function") return file.text();

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.onerror = () => reject(reader.error);
		reader.readAsText(file);
	});
}

// Ссылка — единственный инструмент с данными: адрес задаётся не переключением (см. applyLink).
const LINK: FormatTool = "link";

// нативные правки (печать/удаление), состояние до которых запоминаем для собственного undo;
// вставка/перетаскивание и Enter обрабатываются отдельно, undo/redo — на keydown
const NATIVE_EDIT_TYPES = new Set([
	"insertText",
	"insertReplacementText",
	"insertCompositionText",
	"deleteContentBackward",
	"deleteContentForward",
	"deleteWordBackward",
	"deleteWordForward",
	"deleteByCut",
]);

// Ввод текста, который не проходит через keydown (IME, автозамена, автодополнение, диктовка), —
// к нему применяем фильтр символов хоста в beforeinput.
const FILTERED_INPUT_TYPES = new Set(["insertText", "insertReplacementText", "insertCompositionText"]);

// Максимальное отставание события change от печати. Сериализация значения — самая дорогая
// операция редактора (обход всего содержимого), а печать даёт input на каждый символ.
// Это троттлинг, а не debounce: при непрерывном наборе значение всё равно обновляется
// каждые CHANGE_THROTTLE_MS, а не откладывается до паузы.
const CHANGE_THROTTLE_MS = 150;

// Буква физической клавиши (KeyA…KeyZ) — не зависит от раскладки. Для не-латинских раскладок
// (например, кириллицы) e.key даёт другую букву, поэтому хоткеи сверяем и по e.code.
function codeLetter(e: KeyboardEvent): string {
	return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : "";
}

// Совпадает ли нажатие с латинской буквой хоткея — по e.key (латиница/AZERTY) или e.code (кириллица и пр.).
function isHotkeyLetter(e: KeyboardEvent, letter: string): boolean {
	return e.key.toLowerCase() === letter || codeLetter(e) === letter;
}

/** Коробка строки — какую высоту занимает строка текста. */
type LineBox = { top: number; bottom: number; height: number };

/**
 * Коробки строк, занятых узлом. У переносимого текста их несколько, и общая коробка накрывает
 * их все — для доводки прокрутки нужна конкретная строка, поэтому берём список, а не объединение.
 * В среде без раскладки (jsdom) список пуст, там остаётся общая коробка.
 */
function lineRects(node: Node): LineBox[] {
	let source: { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect } | null = null;

	if (node.nodeType === Node.TEXT_NODE) {
		const range = node.ownerDocument?.createRange();
		if (range) {
			range.selectNodeContents(node);
			source = range;
		}
	} else if (node.nodeType === Node.ELEMENT_NODE) {
		source = node as Element;
	}

	if (typeof source?.getBoundingClientRect !== "function") return [];

	const rects = Array.from(source.getClientRects?.() ?? []);
	return rects.length ? rects : [source.getBoundingClientRect()];
}

/**
 * Строка, на которой стоит каретка, когда собственной коробки у неё нет — так бывает на пустой
 * строке. Ищем ближайший измеримый ориентир на ТОЙ ЖЕ строке.
 */
function caretLineBox(range: Range): LineBox | null {
	const { startContainer: node, startOffset: offset } = range;

	if (node.nodeType === Node.ELEMENT_NODE) {
		// Узел ПОСЛЕ каретки стоит на её строке: <br> рисуется в конце строки, которую завершает,
		// а текст за кареткой с этой строки начинается. Узел ДО каретки лежит строкой выше —
		// по нему прокрутка недоезжала ровно на строку.
		const next = node.childNodes[offset];
		if (next) return lineRects(next)[0] ?? null;

		// Каретка за последним узлом: своей строки у неё ещё нет, а предыдущий <br> завершает
		// предыдущую — она ровно на строку ниже него.
		const previous = node.childNodes[offset - 1];
		if (previous) {
			const rects = lineRects(previous);
			const last = rects[rects.length - 1];
			if (!last) return null;

			const shift = previous.nodeName === "BR" ? last.height : 0;
			return { top: last.top + shift, bottom: last.bottom + shift, height: last.height };
		}
	}

	// Соседей нет вовсе: пустой блок и есть строка каретки.
	const own = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
	return own ? (lineRects(own)[0] ?? null) : null;
}

export interface RichEditorOptions {
	/** Включает форматирование и панель инструментов. */
	format?: boolean;
	/** Состав инструментов (по умолчанию все). */
	tools?: FormatTool[];
	/** Кнопки действий в панели: очистка форматирования, отмена, повтор (по умолчанию нет). */
	actions?: EditorAction[];
	/** Формат хранения значения при форматировании. */
	storage?: FormatStorage;
	/** Переопределения markdown-маркеров. */
	markers?: Partial<FormatMarkers>;
	/** Текст-заглушка (атрибут data-placeholder). */
	placeholder?: string | null;
	/** Многострочный режим. */
	multiline?: boolean;
	/** Что делает Enter: новый абзац (по умолчанию) или мягкий перенос, как в мессенджерах. */
	paragraph?: ParagraphMode;
	/**
	 * Block types of the multiline mode: quote, code block (all of them by default). A field that
	 * has no use for them is limited by an empty list. Plain text is always in the set — a block
	 * is turned back into it.
	 */
	blocks?: BlockType[];
	/**
	 * Держать ли фокус в поле, пока над ним открыта панель смайликов. По умолчанию держим —
	 * каретка на виду, и видно, куда встанет символ; на сенсорном устройстве нет: там фокус
	 * держит на экране клавиатуру, и она закрывает собой саму панель.
	 *
	 * Модального окна это не касается: правка идёт в нём, и фокус поле отдаёт всегда.
	 */
	keepFocus?: boolean;
	/** Только для чтения — запрещает ввод и изменение текста (но не выделение/копирование). */
	readonly?: boolean;
	/**
	 * Полное отключение: тот же запрет правок, что и readonly, но вдобавок с редактируемого
	 * элемента снимается contenteditable — он не берёт ни фокус, ни выделение (в отличие от
	 * readonly, где выделение и копирование остаются).
	 */
	disabled?: boolean;
	/** Контейнер для панели форматирования; по умолчанию document.body (position: fixed над редактором). */
	toolbarContainer?: HTMLElement | null;
	/** Собственные кнопки хоста в панели — для действий, которых редактор не знает. */
	buttons?: ToolbarButton[];
	/** Начальное значение. */
	value?: string;

	// --- хуки хоста (например, TextBox: фильтрация по типу, submit, индикация ошибки) ---
	/** Возврат false — отклонить вводимый символ. */
	filterChar?: (char: string) => boolean;
	/** Возврат null — отклонить вставку; иначе очищенный текст. */
	filterPaste?: (text: string) => string | null;
	/** Ввод отклонён (символ/вставка). */
	onReject?: () => void;
	/** Enter в однострочном режиме. */
	onEnter?: () => void;
}

export interface RichEditorChangeData {
	editor: RichEditor;
	value: string;
}

type RichEditorEvents = {
	[CHANGE_EVENT]: (data: RichEditorChangeData) => void;
};

export default class RichEditor extends UIElementBound<RichEditorEvents> {
	readonly editable: HTMLElement;
	readonly format: boolean;
	/**
	 * Объявленный набор инструментов: им разбирается и сохраняется значение. Не то же, что набор
	 * кнопок ({@link formatTools}) — показывать разметку редактор обязан и там, где её не
	 * переключить. Так же разведены и блоки ({@link blockTypes} против {@link blockTools}).
	 */
	readonly formatTypes: FormatTool[];
	/** Инструменты в панели: в режиме только для чтения их нет — переключать разметку там нечем. */
	readonly formatTools: FormatTool[];
	readonly editorActions: EditorAction[];
	readonly formatStorage: FormatStorage;
	readonly formatMarkers: FormatMarkers;
	readonly multiline: boolean;
	readonly paragraph: ParagraphMode;
	readonly blockTypes: BlockType[];
	readonly keepFocus: boolean;
	readonly toolbarContainer: HTMLElement | null;
	readonly toolbarButtons: ToolbarButton[];

	private __opts: RichEditorOptions;
	private __abort = new AbortController();
	private __pendingFormats = new Set<FormatTool>();
	private __hasInputClick = false;
	private __editHolds = 0; // правка продолжается в окне хоста — см. holdEditing
	// Каретка, снятая при отпускании фокуса: без фокуса браузер может убрать и выделение,
	// а вставке из попапа нужно место — см. releaseFocus.
	private __detachedCaret: [number, number] | null = null;
	private __emojiHold: (() => void) | null = null; // правка придержана на время попапа смайликов
	private __emojiPicker: HTMLElement | null = null; // попап, открытый этим редактором — закрыть его в destroy
	private __releasingFocus = false; // фокус снимаем сами, а не уходят из поля — см. releaseFocus
	// Компонент снят. Удержание правки переживает снятие (окно хоста закрывается позже), и по его
	// снятию трогать содержимое уже нельзя — редактора нет.
	private __disposed = false;
	private __changeTimer = 0; // отложенное change по печати — см. __emitChange/flushChange
	// Окно редактируемого элемента, взятое при создании. Таймер отложенного change переживает
	// снятие компонента и гасится в destroy, а тот случается когда угодно — к этому моменту
	// до глобального окружения может быть уже не добраться, да и элемент мог жить в iframe.
	private readonly __window: Window;
	// собственная история undo/redo — только при форматировании (см. ./history)
	private __history: EditorHistory | null = null;

	constructor(editable: HTMLElement, options: RichEditorOptions = {}) {
		const format = !!options.format;
		const multiline = !!options.multiline;
		// disabled — тот же запрет правок, что и readonly, поэтому вся readonly-механика
		// (блокировка ввода, снятие кнопок, выделение-только-чтение) действует и в нём
		const disabled = !!options.disabled;
		const readonly = !!options.readonly || disabled;
		// Объявленный набор — от readonly не зависит: значение обязано разбираться и показываться
		// и там, где разметку не переключить, иначе редактор для чтения показывал бы вместо
		// жирного сырые звёздочки. Кнопки — уже без него.
		const types = format ? (options.tools ?? ALL_FORMAT_TOOLS.slice()) : [];
		const tools = readonly ? [] : types;
		// действия подключаются явно — иначе панель у существующих хостов молча обзавелась бы кнопками
		const actions = format && !readonly ? (options.actions ?? []) : [];

		// тулбар общий и живёт в body (см. ./toolbar), поэтому обёртка не нужна —
		// привязываем UIElement прямо к переданному элементу, он же и редактируемый
		editable.classList.add(ROOT_CLASS);

		super("BrandUp.RichEditor", editable);

		this.editable = editable;
		this.__window = editable.ownerDocument.defaultView ?? window;
		this.__opts = options;
		this.format = format;
		this.formatTypes = types;
		this.formatTools = tools;
		this.editorActions = actions;
		this.formatStorage = options.storage === "markdown" ? "markdown" : "html";
		this.formatMarkers = Object.assign(defaultFormatMarkers(), options.markers);
		this.multiline = multiline;
		this.paragraph = options.paragraph ?? "block";
		// Блоки — часть многострочной модели: в однострочном режиме верхнего уровня нет вовсе,
		// а в readonly их не переключить, но разбор и показ значения обязаны работать и там.
		this.blockTypes = multiline ? normalizeBlockTypes(options.blocks) : [DEFAULT_BLOCK];
		this.keepFocus = options.keepFocus ?? !IS_TOUCH_DEVICE;
		this.toolbarContainer = options.toolbarContainer ?? null;
		// кнопки хоста живут и без форматирования, но не в readonly — там панели нет вовсе
		this.toolbarButtons = readonly ? [] : (options.buttons ?? []);
		// история включается вместе с форматированием
		this.__history = format ? new EditorHistory(editable) : null;

		// редактируемость есть всегда; правки в readonly блокируются на beforeinput,
		// при этом остаётся возможность фокуса, выделения и копирования.
		// В disabled редактируемости нет вовсе: элемент не берёт ни фокус, ни выделение.
		editable.contentEditable = disabled ? "false" : "true";

		if (options.placeholder != null) editable.dataset.placeholder = options.placeholder;
		if (multiline) editable.classList.add("multiline");
		// абзац-строка: отступы между абзацами показывали бы пустую строку, которой в значении нет
		if (!this.__separateParagraphs && multiline) editable.classList.add(BREAKS_CLASS);
		if (readonly) editable.classList.add("readonly");

		this.__initEvents();

		this.__render(options.value ?? "");
		this.__normalize(false); // нормализация без события (инициализация)
	}

	get readonly(): boolean {
		// disabled включает весь запрет правок readonly: на этот getter опирается вся
		// readonly-механика редактора, и в disabled она обязана работать так же
		return !!this.__opts.readonly || this.disabled;
	}

	/** Редактор отключён: как readonly, но без фокуса и выделения (contenteditable снят). */
	get disabled(): boolean {
		return !!this.__opts.disabled;
	}

	/**
	 * Разделяет ли абзацы пустая строка. Содержимое в обоих режимах — абзацные блоки, но значат
	 * они разное: в block абзац это абзац (`\n\n`), в break — строка (`\n`), а пустая строка
	 * сообщения хранится пустым абзацем. Поэтому в break у абзацев нет и отступов: между двумя
	 * строками их на экране быть не должно.
	 */
	private get __separateParagraphs(): boolean {
		return this.multiline && this.paragraph === "block";
	}

	// формат хранения значения: format → выбранный; plain → markdown без инструментов (\n\n/\n)
	private get __valueStorage(): FormatStorage {
		return this.format ? this.formatStorage : "markdown";
	}
	// разбор и сохранение значения — по объявленному набору, а не по набору кнопок:
	// в readonly кнопок нет, а разметка значения от этого не меняется
	private get __valueTools(): FormatTool[] {
		return this.formatTypes;
	}

	// --- публичный API ---

	getValue(): string {
		// multiline → модель абзацев (<p>/\n\n) и мягких переносов (<br>/\n)
		return serialize(
			this.editable,
			this.__valueStorage,
			this.__valueTools,
			this.formatMarkers,
			this.multiline,
			this.blockTypes,
			this.__separateParagraphs
		);
	}

	setValue(value: string): void {
		// каретка внутри относилась к прежнему содержимому — после замены ставим её в конец
		const hadCaret = !!this.selection;

		this.__render(value ?? "");
		this.__normalize(false);
		if (hadCaret) caretToEnd(this.editable, this.multiline);

		this.__emitChange();
	}

	/**
	 * Вставляет текст в каретку (или вместо выделения) с учётом ожидающих форматов режима набора.
	 * Каретка сохраняется и после потери фокуса, поэтому метод работает и при вызове из кода —
	 * например, кнопкой панели, которая не должна забирать фокус у редактора.
	 */
	insertText(text: string): void {
		if (this.readonly || !text) return;

		// фокус мог быть отпущен на время окна хоста — вместе с ним могло уйти и выделение
		if (!this.selection) this.__reviveCaret();
		if (!this.selection) return;

		// вставка — такой же ввод, как с клавиатуры, поэтому проходит через filterChar хоста
		// (ограничения по типу поля и длине). Обход символов идёт по кодпойнтам, чтобы эмодзи
		// проверялся целиком; длина сверяется с текущим содержимым, так что многосимвольная
		// вставка ограничивается по первому символу — для одного символа проверка точная.
		const filterChar = this.__opts.filterChar;
		if (filterChar && !Array.from(text).every((char) => filterChar(char))) {
			this.__reject();
			return;
		}

		this.__history?.record("op");
		this.__insertText(text);
	}

	/**
	 * Показать попап смайликов у кнопки.
	 *
	 * Попап приносит владелец — у панели форматирования свой, у поля сообщения свой (собирает
	 * их {@link createEmojiPicker}). Редактор берёт на себя только своё: придержать правку,
	 * поставить каретку, отпустить фокус и убрать панель, если попап раскрывается не из неё.
	 *
	 * Вызывать из обработчика `click`, погасив всплытие: иначе попап закроется тем же кликом,
	 * которым открылся. Возвращает false, если попап этим нажатием закрылся.
	 */
	openEmojiPicker(picker: HTMLElement, initiator: HTMLElement): boolean {
		if (this.readonly) return false;

		// Попап у кнопки хоста — самостоятельный слой, и показывать его вместе с панелью нельзя:
		// это два всплывающих окна над одним полем. Попап самой панели — её собственный слой,
		// прятать его носителя незачем и нечем.
		const inToolbar = !!picker.closest(`.${TOOLBAR_CLASS}`);

		// Недавние — по хранилищу на момент показа: попап живёт между открытиями, а хранилище
		// тем временем пополняют и другие попапы страницы.
		refreshRecentEmojis(picker);

		PopupManager.open(picker, {
			initiator,
			onClose: () => {
				this.__emojiPicker = null;
				this.__emojiHold?.();
				this.__emojiHold = null;
				if (!inToolbar) formatToolbar.resume();
			},
		});
		// повторное нажатие по кнопке попап закрывает — держать и придерживать больше нечего
		if (!PopupManager.isOpened(picker)) return false;

		this.__emojiPicker = picker;
		if (!inToolbar) formatToolbar.suspend(this);

		// Правку придерживаем на всё время панели: фокус мы отпустим, а снятие фокуса — не конец
		// ввода. Иначе нормализация обрезала бы пробел у каретки, и символ встал бы вплотную.
		this.__emojiHold ??= this.holdEditing();

		// По кнопке могли нажать, ни разу не заходя в поле, — тогда каретки нет и вставлять символ
		// некуда. В конец её ставит focus(true), и только если её действительно не было: снятую
		// при отпускании фокуса он вернёт на место, а иначе символ уезжал бы в конец сообщения
		// с каждым открытием панели.
		if (!this.selection) this.focus(true);

		// Панель — слой над полем, а не вместо него: каретку видно, и видно, куда встанет символ.
		// На сенсорном устройстве фокус вместо этого поднимает клавиатуру, которая саму панель
		// и закрывает, — там его отпускаем, а каретку вернёт вставка (см. keepFocus).
		if (!this.keepFocus) this.releaseFocus();

		return true;
	}

	getLength(): number {
		// textContent (а не innerText) корректно считает multiline и работает в jsdom
		return this.editable.textContent?.length ?? 0;
	}

	/**
	 * Фокус в поле. Каретку, стоящую в содержимом, не двигает: правку продолжают там, где её
	 * прервали. Своей защиты обработчика фокуса для этого мало — браузер успевает поставить
	 * при фокусе собственную каретку (в начало содержимого), и она выглядит как «уже стоявшая».
	 *
	 * `atEnd` — куда ставить каретку, если её в поле ещё не было: в конец содержимого, а не
	 * в начало. Так фокусируют по клику мимо текста — это клик за ним, а не перед ним.
	 */
	focus(atEnd = false): void {
		const bounds = this.caretSnapshot() ?? this.__detachedCaret;
		if (bounds) return this.restoreCaret(bounds);

		this.editable.focus();
		if (atEnd) caretToEnd(this.editable, this.multiline);
	}

	/**
	 * Отпускает фокус, запомнив каретку. Пока хост показывает своё окно, полю фокус не нужен:
	 * правка идёт в окне, а мигающая каретка под ним только сбивает с толку. На сенсорном
	 * устройстве фокус к тому же держит на экране клавиатуру, и она закрывает собой само окно.
	 *
	 * Каретка при этом не теряется: {@link insertText} вернёт её сам, а {@link focus} — вместе
	 * с фокусом. Правку на это время придерживает вызывающий (см. {@link holdEditing}): снятие
	 * фокуса не конец ввода, и содержимое трогать рано.
	 */
	releaseFocus(): void {
		if (this.editable.ownerDocument.activeElement !== this.editable) return;

		this.__detachedCaret = this.caretSnapshot();
		this.__releasingFocus = true;

		try {
			this.editable.blur();
		} finally {
			this.__releasingFocus = false;
		}
	}

	// Ставит обратно каретку, снятую при отпускании фокуса. Фокус не возвращает: вставке из
	// панели он не нужен, а на сенсорном устройстве вернул бы и клавиатуру.
	private __reviveCaret() {
		const bounds = this.__detachedCaret;
		if (!bounds) return;

		const selection = documentSelection(this.editable);
		if (selection) restoreSelection(this.editable, bounds[0], bounds[1], selection);
	}

	/**
	 * Снимок каретки текстовыми смещениями — пережить работу окна хоста. Пока оно открыто, фокус
	 * уходит туда, а с ним и выделение документа: в окне могут быть свои поля ввода, и каретка
	 * встанет уже в них. Снимать нужно до открытия, возвращать — через {@link restoreCaret}.
	 *
	 * Смещения остаются верными, потому что на это время содержимое не меняется (см. {@link holdEditing}).
	 */
	caretSnapshot(): [number, number] | null {
		const selection = this.selection;

		return selection ? selectionCharBounds(this.editable, selection.getRangeAt(0)) : null;
	}

	/** Возвращает в поле фокус и каретку по снимку {@link caretSnapshot}. */
	restoreCaret(bounds: [number, number]): void {
		this.editable.focus();

		const selection = documentSelection(this.editable);
		if (selection) restoreSelection(this.editable, bounds[0], bounds[1], selection);
	}

	/**
	 * Сообщает, что правка продолжается снаружи: хост открыл своё окно, фокус ушёл туда, но ввод
	 * не закончен. Пока удержание живо, `blur` не считается концом ввода и содержимое не приводится
	 * к нормальному виду — иначе пробел на границе каретки был бы срезан как краевой, а сама каретка
	 * съехала бы на пересчёте смещений, и текст из окна встал бы не туда и вплотную к соседнему слову.
	 *
	 * Возвращает снятие удержания: повторные вызовы ничего не делают. Если к этому моменту фокус
	 * в поле не вернулся, содержимое доводится сразу — другого `blur` уже не будет.
	 */
	holdEditing(): () => void {
		this.__editHolds++;

		let released = false;

		return () => {
			if (released) return;
			released = true;

			this.__editHolds--;
			if (this.__editHolds > 0 || this.__disposed) return;

			if (this.editable.ownerDocument.activeElement !== this.editable) {
				this.__normalize(true);
				this.flushChange();
			}
		};
	}

	onChange(handler: (e: RichEditorChangeData) => void) {
		this.on(CHANGE_EVENT, handler);
	}

	/**
	 * Выделение, если оно находится внутри этого редактора. Браузер сохраняет выделение и после
	 * blur, поэтому проверка работает и когда фокус ушёл на кнопку страницы.
	 */
	get selection(): Selection | null {
		return innerSelection(this.editable);
	}

	/**
	 * Выделить узел внутри редактора — например, чтобы следующая вставка заменила его целиком.
	 * Не зависит от того, где стоит выделение сейчас: оно могло уйти, пока хост показывал
	 * своё окно, а сам узел никуда не делся.
	 */
	selectNode(node: Node): void {
		if (!this.editable.contains(node)) return;

		const selection = documentSelection(this.editable);
		if (!selection) return;

		const range = this.editable.ownerDocument.createRange();
		range.selectNode(node);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	/**
	 * Слово, на котором стоит каретка. Пусто, когда выделение своё (пользователь выбрал сам,
	 * и подставлять ему нечего), когда каретки в редакторе нет вовсе или когда она стоит не
	 * в слове — за точкой, например: знаки препинания в слово не входят (см. expandRangeToWords).
	 */
	get caretWord(): string {
		const selection = this.selection;
		if (!selection || selection.rangeCount === 0) return "";

		const range = selection.getRangeAt(0);
		if (!range.collapsed) return "";

		return expandRangeToWords(this.editable, range).toString();
	}

	/**
	 * Выделить слово под кареткой — чтобы следующая вставка встала на его место, а не разорвала
	 * его пополам. Возвращает false, когда выделять нечего: тогда вставка идёт в точку каретки.
	 */
	selectCaretWord(): boolean {
		const selection = documentSelection(this.editable);
		if (!selection || selection.rangeCount === 0) return false;

		const range = selection.getRangeAt(0);
		if (!range.collapsed) return false;

		const word = expandRangeToWords(this.editable, range);
		if (word.collapsed) return false;

		selection.removeAllRanges();
		selection.addRange(word);
		return true;
	}

	/**
	 * Цель правки форматирования: выделение, расширенное до целых слов, плюс исходные границы
	 * для восстановления. Диапазон отдельный от выделения — пока операция не решила, что будет
	 * править, каретка пользователя не двигается. null — правка недоступна или выделение вне редактора.
	 */
	private __formatTarget(): { selection: Selection; range: Range; original: () => [number, number] } | null {
		if (!this.format || this.readonly) return null;

		const selection = this.selection;
		if (!selection) return null;

		const current = selection.getRangeAt(0);

		return {
			selection,
			// форматируем слова целиком: и при курсоре без выделения, и при выделении части слова
			range: expandRangeToWords(this.editable, current),
			// границы считаем по требованию: они нужны только правкам, а цель вычисляется ещё и
			// на каждое обновление панели, где сбор всего текста в строку — самая дорогая операция
			original: () => selectionCharBounds(this.editable, current),
		};
	}

	/**
	 * Доступен ли инструмент в текущем месте. В коде разметки нет: и моноширинный, и блок кода
	 * оставляют написанное буквальным, поэтому остальные инструменты там выключены — иначе
	 * форматирование ставилось бы только чтобы пропасть при сохранении.
	 */
	isToolEnabled(tool: FormatTool, codeActive?: boolean): boolean {
		if (this.readonly || !this.formatTools.includes(tool)) return false;
		if (tool === CODE) return true;
		// Признак «в коде» — обход выделения: панель считает его один раз на обновление
		// и передаёт сюда, чтобы не обходить выделение заново на каждую кнопку.
		if (codeActive ?? this.isCodeActive()) return false;

		// Ссылке нужен текст, который ею станет: оборачивать нечего — и делать нечего. Каретка
		// в слове за текст считается (формат применяется к слову целиком), в готовой ссылке —
		// тоже: её адрес правят той же кнопкой.
		return tool !== LINK || this.__hasLinkTarget();
	}

	/** Есть ли что делать ссылкой: текст под выделением или ссылка, в которой стоит каретка. */
	private __hasLinkTarget(): boolean {
		const target = this.__formatTarget();
		if (!target) return false;

		return !target.range.collapsed || !!linkAt(this.editable, target.range);
	}

	/**
	 * Адрес ссылки под кареткой; пусто — каретка не в ссылке.
	 *
	 * Состояние ссылки — не «включена», а «вот этот адрес»: панели нужен он сам, иначе править
	 * существующую ссылку было бы нечем.
	 */
	get currentLink(): string {
		const selection = this.selection;
		if (!selection) return "";

		return linkAt(this.editable, selection.getRangeAt(0))?.getAttribute("href") ?? "";
	}

	/**
	 * Ставит ссылку на выделение, меняет адрес у той, в которой стоит каретка, либо снимает её —
	 * пустым адресом. Оборачивать нечего — не делает ничего: ссылка это оформление текста,
	 * а не вставка (см. {@link isToolEnabled}, там же гаснет и кнопка).
	 *
	 * Не переключатель, в отличие от {@link applyFormat}: у ссылки есть данные, и повторное
	 * применение с другим адресом — правка, а не снятие.
	 */
	applyLink(url: string): void {
		if (!this.isToolEnabled(LINK)) return;

		// Правит по выделению в поле. Поле адреса в панели забирает фокус, поэтому каретку она
		// снимает при открытии и возвращает перед вызовом — см. openLink в ./toolbar.
		const target = this.__formatTarget();
		if (!target) return;

		// Выделение без единого символа правки не даёт (см. applyFormat) — кроме каретки
		// в готовой ссылке, где правится её адрес.
		if (!target.range.toString().length && !linkAt(this.editable, target.range)) return;

		this.__history?.record("op");
		applyLinkTo(this.editable, target.range, url.trim(), target.selection, target.original());

		this.__pendingFormats.clear();
		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Переключить форматирование инструмента (вызывается общим тулбаром и хоткеями). */
	applyFormat(tool: FormatTool): void {
		// у ссылки есть адрес, а переключением его не задать — она ставится через applyLink
		if (tool === LINK) return;
		if (!this.isToolEnabled(tool)) return;

		let target = this.__formatTarget();
		if (!target) return;

		if (target.range.collapsed) {
			// Каретка в опустевшем теге — слово из него стёрли, а тег остался, и печать продолжится
			// оформленной. Кнопка снимает именно его: режим набора тут ничего не изменил бы,
			// а выключить формат стало бы нечем.
			const empty = emptyFormatAt(this.editable, target.range, tool);
			if (empty) {
				this.__history?.record("op");
				preserveCaret(this.editable, () => empty.replaceWith(...Array.from(empty.childNodes)));
				this.__pendingFormats.delete(tool);

				this.__emitChange();
				formatToolbar.refresh();
				return;
			}

			// под кареткой нет слова — режим набора: формат для следующего ввода
			if (this.__pendingFormats.has(tool)) this.__pendingFormats.delete(tool);
			else this.__pendingFormats.add(tool);

			formatToolbar.refresh();
			return;
		}

		this.__pendingFormats.clear();

		// Выделение без единого символа (граница элементов, голый перенос) правки не даёт —
		// пустой шаг истории делал бы следующий Ctrl+Z «ничего не делающим».
		if (!target.range.toString().length) return;

		this.__history?.record("op");

		// Код не уживается с другой разметкой: значение берёт из него голый текст. Снимаем всё,
		// что было на этом куске, и только потом оборачиваем — иначе прежнее форматирование
		// осталось бы снаружи кода и в поле выглядело бы рабочим.
		if (
			tool === CODE &&
			!isFormatActive(this.editable, target.range, CODE) &&
			hasFormatting(this.editable, target.range)
		) {
			clearFormat(this.editable, target.range, target.selection, target.original());

			// правка перестроила узлы — прежний диапазон указывает в никуда
			target = this.__formatTarget();
			if (!target) return;
		}

		toggleFormat(this.editable, target.range, tool, target.selection, target.original());

		this.__emitChange();
		formatToolbar.refresh();
	}

	/**
	 * Типы блоков для панели. От {@link blockTypes} отличается только запретом правки: разбирать
	 * и показывать цитату и код редактор обязан и в режиме только для чтения, а переключать их
	 * там нечем — кнопок быть не должно.
	 */
	get blockTools(): BlockType[] {
		return this.readonly ? [] : this.blockTypes;
	}

	/**
	 * Тип блока под кареткой. Без выделения (или вне блоков) — тип по умолчанию: именно им
	 * станет то, что сейчас наберут.
	 */
	get currentBlock(): BlockType {
		const selection = this.selection;
		if (!selection) return DEFAULT_BLOCK;

		const block = blockAt(this.editable, selection.getRangeAt(0).startContainer);

		return blockTypeOf(block) ?? DEFAULT_BLOCK;
	}

	/**
	 * Переключить тип блоков под выделением. Повторное применение того же типа возвращает
	 * блок к обычному тексту — иначе выйти из цитаты можно было бы только через другую кнопку.
	 */
	applyBlock(type: BlockType): void {
		if (!this.multiline || this.readonly || !this.blockTypes.includes(type)) return;

		const selection = this.selection;
		if (!selection) return;

		const range = selection.getRangeAt(0);
		const target = this.currentBlock === type ? DEFAULT_BLOCK : type;

		// нечего менять — не пишем в историю пустой шаг и не трогаем выделение.
		// В пустом редакторе блока ещё нет, но завести его можно (кроме типа по умолчанию —
		// им пустое поле и так является).
		const blocks = blocksInRange(this.editable, range);
		const nothing = this.editable.firstChild
			? !blocks.length || blocks.every((block) => blockTypeOf(block) === target)
			: target === DEFAULT_BLOCK;

		if (nothing) return;

		this.__history?.record("op");

		// Смена тега переносит содержимое в новый элемент — живые границы выделения этого
		// не переживают, поэтому держим каретку по текстовым смещениям.
		const bounds = selectionCharBounds(this.editable, range);
		const { created } = applyBlocks(this.editable, range, target, !this.__separateParagraphs);

		// Возврат блока в обычный текст оставляет его строки мягкими переносами — приводим их
		// к абзацам. Строго ДО возврата каретки: разбиение блока живой Range не переживает,
		// а смещения от него не меняются — граница абзацев и мягкий перенос считаются одинаково.
		if (!this.__separateParagraphs) splitSoftBreaks(this.editable);

		// Разделение блока добавило границы, а они в смещениях считаются — прежние уже не те.
		// Выделяем то, что стало блоком: заодно видно, к каким строкам правка и относилась.
		// В пустом блоке выделять нечего — там только каретка.
		if (created) {
			const inside = this.editable.ownerDocument.createRange();
			inside.selectNodeContents(created);
			if (!(created.textContent ?? "")) inside.collapse(true);

			selection.removeAllRanges();
			selection.addRange(inside);
		} else {
			restoreSelection(this.editable, bounds[0], bounds[1], selection);
		}

		// Соседние цитаты в режиме мягких переносов — одна цитата: склеиваем сразу, а не на
		// потерю фокуса, иначе поле до неё показывает два блока вместо одного.
		//
		// Строго после возврата каретки: склейка снимает границу блоков, а её смещения считают,
		// и восстановленная по прежним смещениям каретка съехала бы на символ. Живое выделение
		// переезжает вместе с узлами само.
		if (!this.__separateParagraphs) mergeAdjacentBlocks(this.editable);

		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Код в любом виде: моноширинный на выделении или блок кода под кареткой. */
	isCodeActive(): boolean {
		return this.currentBlock === CODE || this.isToolActive(CODE);
	}

	/**
	 * Единая правка кода — то, что в мессенджерах делает одна кнопка. Вид выбирается по объёму
	 * правки: выделена одна строка или её часть — моноширинный, больше одной строки — блок.
	 *
	 * Блоком становится и правка без выделения: моноширинным там делать нечего, а иначе блок
	 * оказался бы недостижим — в пустом поле не выделить строки, которых ещё нет.
	 *
	 * Повторное применение снимает тот вид, который сейчас и включён.
	 */
	applyCode(): void {
		const inline = this.formatTools.includes(CODE);
		const block = this.multiline && this.blockTypes.includes(CODE);
		if (!inline && !block) return;

		if (block && this.currentBlock === CODE) return this.applyBlock(CODE); // выйти из блока
		if (inline && this.isToolActive(CODE)) return this.applyFormat(CODE); // снять моноширинный

		const range = this.selection?.getRangeAt(0);
		const part = !!range && !range.collapsed && !this.__coversLines(range);

		if (inline && (part || !block)) this.applyFormat(CODE);
		else if (block) this.applyBlock(CODE);
	}

	/**
	 * Выделено больше одной строки: захвачено несколько блоков либо мягкий перенос внутри.
	 * Одна строка — даже целиком — остаётся куском текста: код на ней это моноширинный.
	 */
	private __coversLines(range: Range): boolean {
		return blocksInRange(this.editable, range).length > 1 || !!range.cloneContents().querySelector("br");
	}

	/**
	 * Снимает всё форматирование с выделения; без выделения — со слова под кареткой
	 * (как и применение формата). Режим набора сбрасывается.
	 */
	clearFormat(): void {
		const target = this.__formatTarget();
		if (!target) return;

		this.__clearPendingFormats();

		// нечего очищать — не пишем в историю пустой шаг и не трогаем выделение
		if (!hasFormatting(this.editable, target.range)) return;

		this.__history?.record("op");
		clearFormat(this.editable, target.range, target.selection, target.original());

		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Снимает всё форматирование со всего содержимого (выделение не требуется). */
	clearAllFormat(): void {
		if (!this.format || this.readonly) return;

		this.__clearPendingFormats();
		if (!hasAnyFormatting(this.editable)) return;

		this.__history?.record("op");
		// разворачивание тегов рвёт выделение — сохраняем его по текстовым смещениям
		preserveCaret(this.editable, () => clearAllFormat(this.editable));

		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Доступна ли отмена (история ведётся только при включённом форматировании). */
	get canUndo(): boolean {
		return !this.readonly && !!this.__history?.canUndo;
	}

	/** Доступен ли повтор отменённого. */
	get canRedo(): boolean {
		return !this.readonly && !!this.__history?.canRedo;
	}

	/** Отменить последнее действие (история ведётся только при форматировании). */
	undo(): void {
		if (this.readonly || !this.__history?.undo()) return;
		this.__afterHistory();
	}

	/** Повторить отменённое действие. */
	redo(): void {
		if (this.readonly || !this.__history?.redo()) return;
		this.__afterHistory();
	}

	/** Выполнить действие панели (вызывается кнопками тулбара). */
	applyAction(action: EditorAction): void {
		if (!this.editorActions.includes(action)) return;

		switch (action) {
			case "erase":
				this.clearFormat();
				break;
			case "undo":
				this.undo();
				break;
			case "redo":
				this.redo();
				break;
			case "emoji":
				// панель вставки открывает тулбар: ей нужна кнопка как якорь попапа.
				// Вставка символа приходит сюда через insertText.
				break;
		}
	}

	/** Доступно ли действие сейчас (для disabled-состояния кнопки тулбара). */
	isActionEnabled(action: EditorAction): boolean {
		switch (action) {
			case "undo":
				return this.canUndo;
			case "redo":
				return this.canRedo;
			case "erase":
				return this.__hasFormatting();
			case "emoji":
				return !this.readonly;
		}
	}

	// Есть ли что очищать: ожидающий формат режима набора либо форматирование на цели очистки.
	// Смотрим на тот же расширенный до слов диапазон, что возьмёт clearFormat, — иначе кнопка
	// блокировалась бы в случаях, когда операция сработала бы (каретка на границе формата).
	private __hasFormatting(): boolean {
		if (this.__pendingFormats.size > 0) return true;

		const target = this.__formatTarget();
		return !!target && hasFormatting(this.editable, target.range);
	}

	private __afterHistory(): void {
		this.__pendingFormats.clear();
		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Активен ли формат инструмента на текущем выделении (для подсветки кнопки тулбара). */
	isToolActive(tool: FormatTool): boolean {
		if (this.__pendingFormats.has(tool)) return true;

		const selection = this.selection;
		if (!selection) return false;

		return isFormatActive(this.editable, selection.getRangeAt(0), tool);
	}

	/**
	 * Активные форматы всех инструментов сразу — панель обновляется на каждое движение каретки,
	 * а поинструментный опрос обходил бы содержимое столько раз, сколько кнопок.
	 */
	activeTools(): ReadonlySet<FormatTool> {
		const selection = this.selection;
		const active = selection
			? activeFormats(this.editable, selection.getRangeAt(0), this.formatTools)
			: new Set<FormatTool>();

		for (const tool of this.__pendingFormats) active.add(tool);

		return active;
	}

	override destroy(): void {
		this.__disposed = true;
		this.flushChange(); // хост не должен остаться с устаревшей копией значения
		this.__abort.abort();

		// Попап смайликов мог остаться открытым, а показывали его мы — своим он бывает и у хоста
		// (см. openEmojiPicker). Оставленный, он держал бы PopupManager на удалённом элементе:
		// на body висел бы класс открытого попапа и слушатель закрытия, а на узком экране
		// страница осталась бы непрокручиваемой.
		if (this.__emojiPicker && PopupManager.isOpened(this.__emojiPicker)) PopupManager.close();

		formatToolbar.detach(this);

		// элемент передан хостом — не удаляем его, только снимаем оформление редактора
		this.editable.classList.remove(
			ROOT_CLASS,
			UNSELECTABLE_CLASS,
			BREAKS_CLASS,
			"multiline",
			"readonly",
			"focused"
		);
		this.editable.removeAttribute("contenteditable");
		delete this.editable.dataset.placeholder;

		super.destroy();
	}

	// --- рендеринг и значение ---

	private __render(value: string) {
		DOM.empty(this.editable);
		if (!value) return;

		// multiline → <p>-абзацы; single-line → инлайновое содержимое
		this.editable.innerHTML = deserialize(
			value,
			this.__valueStorage,
			this.__valueTools,
			this.formatMarkers,
			this.multiline,
			this.blockTypes,
			this.__separateParagraphs
		);

		// пустые абзацы значения получают заполнитель, чужая вёрстка — канонический тег
		if (this.multiline) ensureParagraphs(this.editable);
	}

	/**
	 * Событие изменения. При `defer` (печать) доставка откладывается — иначе каждый символ
	 * стоил бы полной сериализации содержимого. Все прочие правки (вставка, формат, отмена,
	 * setValue) сообщаются сразу: они разовые, а не посимвольные.
	 *
	 * `getValue()` считает значение по DOM и точен всегда; отложено только уведомление
	 * и, как следствие, копия значения у хоста — её сбрасывает {@link flushChange}.
	 */
	private __emitChange(defer = false) {
		if (defer) {
			// троттлинг: первый ввод заводит таймер, последующие в этом окне его не сдвигают
			this.__changeTimer ||= this.__window.setTimeout(() => this.__emitChange(), CHANGE_THROTTLE_MS);
			return;
		}

		this.__cancelChange();
		this.trigger(CHANGE_EVENT, <RichEditorChangeData>{ editor: this, value: this.getValue() });
	}

	private __cancelChange() {
		if (!this.__changeTimer) return;

		this.__window.clearTimeout(this.__changeTimer);
		this.__changeTimer = 0;
	}

	/**
	 * Доставить отложенное изменение немедленно. Вызывать перед тем, как значение читают
	 * извне: отправка формы, валидация, чтение значения хостом. Если ничего не отложено —
	 * ничего и не делает, лишнего события не будет.
	 */
	flushChange(): void {
		if (this.__changeTimer) this.__emitChange();
	}

	private __reject() {
		this.__opts.onReject?.();
	}

	// Нормализация: схлопывание пробелов + обрезка краёв строк; в multiline дополнительно
	// удаление пустых абзацев. Событие change генерируется только при notify=true и реальном изменении
	// (сравниваем innerHTML — дешевле двойной сериализации и ловит структурные правки абзацев).
	private __normalize(notify: boolean) {
		if (this.readonly) return;

		// правка текстовых узлов рвёт живые Range — запоминаем выделение по текстовым смещениям
		const selection = this.selection;
		const bounds = selection ? selectionCharBounds(this.editable, selection.getRangeAt(0)) : null;

		const before = this.editable.innerHTML;
		// текст в координатах каретки (с концами строк) — иначе смещения разъедутся на число строк
		const textBefore = editorText(this.editable);
		normalizeWhitespace(this.editable);
		// В режиме мягких переносов соседние цитаты неразличимы: значение пишет их строки подряд,
		// а разбор собирает в одну — склеиваем и в поле.
		if (this.multiline) normalizeParagraphs(this.editable, !this.__separateParagraphs);
		if (this.editable.innerHTML === before) return;

		if (bounds && selection) {
			// схлопнутые пробелы сдвигают смещения — переносим их на новый текст
			const textAfter = editorText(this.editable);
			const start = mapCharOffset(textBefore, textAfter, bounds[0]);
			const end = bounds[1] === bounds[0] ? start : mapCharOffset(textBefore, textAfter, bounds[1]);
			restoreSelection(this.editable, start, end, selection);
		}

		if (notify) this.__emitChange();
	}

	// --- обработчики ---

	/**
	 * Изоляция выделения: протяжка, начатая вне редактора, не должна затягивать его содержимое —
	 * текст сообщения красился бы как часть страницы.
	 *
	 * Правим не выделение, а выделяемость: пока идёт чужая протяжка, содержимое редактора
	 * невыделяемо, и браузер обходит его сам. Обрезать выделение из кода нельзя — оно в документе
	 * одно, и когда протяжка проходит мимо редактора, оба её конца снаружи: середину из одного
	 * диапазона не вырезать.
	 */
	private __holdSelectable(target: EventTarget | null) {
		// Нажали в самом редакторе — или он в работе: нажатие по панели и кнопкам хоста приходит
		// мимо него, но выделение страницы тут ни при чём, а запрет заодно лишил бы поле
		// редактируемости до следующего клика внутрь. Фокус на этот момент ещё не ушёл.
		const own =
			this.editable.contains(target as Node | null) ||
			this.editable.ownerDocument.activeElement === this.editable;

		this.editable.classList.toggle(UNSELECTABLE_CLASS, !own);
	}

	/**
	 * Снимает запрет, когда нажали в самом редакторе.
	 *
	 * Для касания, где браузер начинает выделять слово прямо на жесте: к этому моменту содержимое
	 * обязано быть выделяемым, а {@link __holdSelectable} снимет запрет только по мышиному
	 * нажатию — оно приходит уже после жеста, а у долгого нажатия не приходит вовсе.
	 */
	private __releaseSelectableAt(target: EventTarget | null) {
		if (this.editable.contains(target as Node | null)) this.editable.classList.remove(UNSELECTABLE_CLASS);
	}

	/**
	 * Снимает запрет, когда выделение перестало задевать редактор.
	 *
	 * Просто по отпусканию кнопки снимать нельзя: диапазон остаётся протянутым через редактор,
	 * и стоит вернуть содержимому выделяемость, как оно тут же оказывается выделенным — будто
	 * запрета и не было. Такой запрет держится до следующего нажатия: внутри редактора оно
	 * снимет запрет, снаружи — начнёт новую протяжку.
	 */
	private __releaseSelectable() {
		if (!this.editable.classList.contains(UNSELECTABLE_CLASS)) return;

		const selection = documentSelection(this.editable);
		const across =
			!!selection &&
			selection.rangeCount > 0 &&
			!selection.isCollapsed &&
			selection.getRangeAt(0).intersectsNode(this.editable);

		if (!across) this.editable.classList.remove(UNSELECTABLE_CLASS);
	}

	private __initEvents() {
		const { signal } = this.__abort;
		const editable = this.editable;

		// Бросок в редактор: текстовые файлы принимаются содержимым (см. __onDrop), всё прочее
		// гасится — свободное перетаскивание прошло бы мимо истории и фильтров хоста.
		// dragenter/dragover отменять нельзя: в модели DnD отмена как раз и означает «сюда можно бросить»
		this.element.addEventListener("drop", (e) => this.__onDrop(e), { signal });

		// Выделение страницы не должно затягивать содержимое редактора — см. __holdSelectable.
		// Слушаем на документе и в фазе перехвата: протяжка начинается где угодно, а обработчик
		// по пути может погасить всплытие.
		const doc = editable.ownerDocument;
		doc.addEventListener("mousedown", (e) => this.__holdSelectable(e.target), { signal, capture: true });
		// По изменению выделения проверять нельзя: пока запрет действует, выделение до редактора
		// не доходит — проверка увидела бы «не задевает» и сняла запрет сама. Только по концу протяжки.
		doc.addEventListener("mouseup", () => this.__releaseSelectable(), { signal, capture: true });
		// Касание: запрет только снимаем, не ставим. Протяжки выделения через страницу на касании
		// нет — там его ведут за собственные ручки, — а вот слово по двойному нажатию браузер
		// выделяет сам, ещё на жесте. Мышиные события к нему приезжают уже после (а у долгого
		// нажатия их и вовсе нет), и снятого по ним запрета жест бы не дождался.
		doc.addEventListener("touchstart", (e) => this.__releaseSelectableAt(e.target), {
			signal,
			capture: true,
			passive: true,
		});

		editable.addEventListener(
			"mousedown",
			() => {
				this.__hasInputClick = true;
				this.__clearPendingFormats(); // перемещение каретки кликом — выход из режима набора
			},
			{ signal }
		);

		editable.addEventListener(
			"focus",
			() => {
				this.element.classList.add("focused");

				// вернулись в поле — каретку ставит браузер или тот, кто вернул фокус
				this.__detachedCaret = null;

				// Пришли править — держать запрет выделения не за чем, а с ним поле осталось бы
				// нередактируемым. Мышью его снимает нажатие, но фокус берут и клавишей, и из кода.
				this.element.classList.remove(UNSELECTABLE_CLASS);

				// нужна ли панель этому редактору, решает она сама — иначе условие пришлось бы
				// держать в двух местах, и стоило добавить кнопки хоста, как они разошлись бы
				formatToolbar.attach(this);

				// В readonly фокус выделяет всё содержимое — его можно копировать;
				// в disabled выделения нет, как и самого содержимого для правки.
				if (this.readonly) {
					if (!this.disabled) selectAllContent(this.editable);
				}
				// Каретку в конец ставим только когда её нет: клик ставит сам, а уже стоящую
				// (фокус вернули из кода после вызова метода) двигать нельзя — уедет в конец текста.
				else if (!this.__hasInputClick && !this.selection) caretToEnd(this.editable, this.multiline);
			},
			{ signal }
		);

		editable.addEventListener(
			"blur",
			() => {
				this.__hasInputClick = false;

				this.element.classList.remove("focused");

				// Фокус отпущен намеренно — это не уход из поля, а работа хоста в своём слое над
				// ним: панель убираем с экрана, но открытую панель смайликов не закрываем, её же
				// ради этого и открыли.
				if (this.__releasingFocus) formatToolbar.suspend(this);
				else formatToolbar.detach(this);

				// правку продолжают в окне хоста — этот blur не конец ввода, содержимое трогать нельзя
				if (this.__editHolds > 0) {
					this.flushChange();
					return;
				}

				// удаляем висящий BR, чтобы появился placeholder
				if (editable.firstChild?.nodeName === "BR") DOM.empty(editable);

				this.__clearPendingFormats();
				this.__normalize(true); // редактирование завершено
				this.flushChange(); // ввод закончен — отложенное изменение доставляем сразу
			},
			{ signal }
		);

		editable.addEventListener("dblclick", () => trimSelectionWhitespace(this.editable), { signal });

		this.element.addEventListener("paste", (e: ClipboardEvent) => this.__onPaste(e), { signal });
		editable.addEventListener("keydown", (e: KeyboardEvent) => this.__onKeydown(e), { signal });

		// Каретку двигали клавишами: браузер к ней прокручивает сам, но до края коробки —
		// под отступы прокручиваемого контейнера. Поправляем после него, на keyup: на keydown
		// своей прокрутки он ещё не сделал, и поправка ушла бы впустую.
		editable.addEventListener(
			"keyup",
			(e: KeyboardEvent) => {
				if (NAV_KEYS.includes(e.key)) this.__scrollCaretIntoView();
			},
			{ signal }
		);

		editable.addEventListener("beforeinput", (e: InputEvent) => this.__onBeforeInput(e), { signal });

		editable.addEventListener(
			"input",
			() => {
				if (this.multiline) {
					this.__ensureParagraphs(); // блуждающий текст/div → <p>

					// единственный пустой абзац → очищаем, чтобы показать placeholder
					if (editable.children.length === 1) {
						const only = editable.firstElementChild!;
						if (only.tagName === "P" && (only.textContent ?? "") === "") DOM.empty(editable);
					}
				} else if (editable.firstChild?.nodeName === "BR") {
					editable.innerHTML = "";
				}
				// При наборе браузер прокручивает к каретке сам, но доводит её лишь до края
				// коробки — под отступы контейнера. Доводим до текста.
				this.__scrollCaretIntoView();

				this.__emitChange(true); // печать — единственный посимвольный источник, его и откладываем
			},
			{ signal }
		);
	}

	/**
	 * Доводит прокрутку до каретки. Нужна там, где браузер не справляется сам: переносы строк
	 * редактор делает вручную (preventDefault), и к новой строке браузер не прокручивает; в
	 * textbox прокручивается не редактируемый элемент, а его обёртка; а своей прокруткой браузер
	 * доводит каретку лишь до края коробки — под отступы, которые едут вместе с текстом.
	 */
	private __scrollCaretIntoView() {
		const selection = this.selection;
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0).cloneRange();

		// в среде без раскладки (jsdom) у Range коробок нет вовсе
		if (typeof range.getBoundingClientRect !== "function") return;

		// Выделение тянут клавишами (Shift+стрелки): вести нужно за его подвижным концом.
		// Коробка всего выделения накрывает все занятые строки, и прокрутка ушла бы к концу
		// неподвижному, уводя подвижный за пределы видимого.
		if (!range.collapsed) {
			const toStart = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
			range.collapse(toStart);
		}

		let { top, bottom, height } = range.getBoundingClientRect();
		if (!height) {
			const line = caretLineBox(range);
			if (!line) return;
			({ top, bottom, height } = line);
		}
		// раскладки нет (тестовая среда) — прокручивать не по чему
		if (!height && !top && !bottom) return;

		// Ближайший прокручиваемый предок; прокручивается только он — внешним контейнерам
		// каретка не адресована, крутить страницу из редактора нельзя.
		const document = this.editable.ownerDocument;
		for (let el: HTMLElement | null = this.editable; el && el !== document.body; el = el.parentElement) {
			if (el.scrollHeight <= el.clientHeight) continue;
			const style = document.defaultView?.getComputedStyle(el);
			if (!style) continue;
			const overflow = style.overflowY;
			if (overflow !== "auto" && overflow !== "scroll") continue;

			// Границей служит не коробка, а область, свободная от отступов: они едут вместе
			// с текстом (см. .editor в textbox, .ui-richeditor в messageeditor), и доведённая
			// до края коробки строка встала бы под них. Своего отступа у контейнера может
			// и не быть — тогда держим небольшой запас, чтобы строка не прилипала к краю.
			const gap = Math.min(height || 16, 16);
			const box = el.getBoundingClientRect();
			const viewTop = box.top + el.clientTop + (parseFloat(style.paddingTop) || gap);
			const viewBottom = box.top + el.clientTop + el.clientHeight - (parseFloat(style.paddingBottom) || gap);

			if (bottom > viewBottom) el.scrollTop += bottom - viewBottom;
			else if (top < viewTop) el.scrollTop -= viewTop - top;
			return;
		}
	}

	/**
	 * Приведение к абзацам с сохранением каретки. Дешёвая проверка — до снимка каретки:
	 * нормализация идёт на каждое нажатие, менять почти всегда нечего, а снимок собирает
	 * весь текст в строку. Если структура не менялась, выделение живо и переставлять его
	 * не нужно (лишний сброс способен прервать IME-набор).
	 */
	private __ensureParagraphs() {
		if (paragraphsNormalized(this.editable)) return;

		preserveCaret(this.editable, () => ensureParagraphs(this.editable));
	}

	private __onKeydown(e: KeyboardEvent) {
		// хоткеи форматирования (Ctrl/Cmd+B/I/U); зачёркивание — только кнопкой.
		// Сверяем по e.key и e.code — иначе на не-латинской раскладке (кириллица) хоткеи не срабатывают.
		if (this.format && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
			const tool = HOTKEY_TOOLS[e.key.toLowerCase()] ?? HOTKEY_TOOLS[codeLetter(e)];
			if (tool) {
				e.preventDefault();
				e.stopPropagation();

				if (this.formatTools.includes(tool)) {
					// у ссылки сперва спрашивается адрес — тем же полем в панели, что и у кнопки
					if (tool === LINK) formatToolbar.openLinkFor(this);
					else this.applyFormat(tool);
				}
				return;
			}
		}

		// undo/redo собственной истории (только при форматировании): Ctrl/Cmd+Z — отмена,
		// Ctrl+Y или Ctrl/Cmd+Shift+Z — повтор. Триггерим на keydown (надёжно во всех состояниях,
		// в т.ч. когда нативный undo/redo-стек пуст); сам нативный undo гасим в __onBeforeInput.
		if (this.__history && (e.ctrlKey || e.metaKey) && !e.altKey) {
			const z = isHotkeyLetter(e, "z");
			if (z && !e.shiftKey) {
				e.preventDefault();
				this.undo();
				return;
			}
			if (isHotkeyLetter(e, "y") || (z && e.shiftKey)) {
				e.preventDefault();
				this.redo();
				return;
			}
		}

		// перемещение каретки — выход из режима набора
		if (NAV_KEYS.includes(e.key)) this.__clearPendingFormats();

		// A character, not a shortcut: Cmd is the same modifier as Ctrl, just on another platform.
		// Without it Cmd+C on a Mac would look like typing the letter "c" — copying would be
		// swallowed by the readonly guard, and the host filter would reject copy, paste and
		// select-all alike.
		const isChar = e.key.length === 1 && !e.ctrlKey && !e.metaKey;

		if (this.readonly && isChar) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		if (isChar && this.__opts.filterChar && !this.__opts.filterChar(e.key)) {
			e.preventDefault();
			e.stopPropagation();
			this.__reject();
			return;
		}

		if (e.key === "Enter" || e.key === "U+000A") {
			e.preventDefault();

			if (!this.multiline) {
				this.__opts.onEnter?.(); // однострочный режим — submit и т.п.
				return;
			}

			// Абзацы и переносы правятся вручную, мимо beforeinput, поэтому запрет на изменение
			// текста проверяем здесь: иначе Enter добавлял бы строки и в режиме только для чтения.
			if (this.readonly) return;

			// В режиме block Enter — новый абзац (<p>), модификатор — мягкий перенос (<br>).
			// В режиме break абзац и есть строка, поэтому её создают оба нажатия: мягкому переносу
			// там неоткуда взяться — в значении он дал бы ровно то же самое.
			// Внутри блока правило берётся у его типа: из цитаты и кода Enter выходит,
			// а модификатор переносит строку внутри.
			const withModifier = e.shiftKey || e.ctrlKey || e.metaKey;
			const current = this.currentBlock;
			const soft =
				current === DEFAULT_BLOCK
					? this.__separateParagraphs && withModifier
					: BLOCK_TYPES[current].enter === "break" || withModifier;

			this.__history?.record("op");
			// Из блока выходят тем же нажатием, что делит его: продолжать цитату или код
			// новым таким же блоком незачем — для этого достаточно переноса строки.
			if (soft) insertSoftBreak(this.editable);
			else insertParagraph(this.editable, DEFAULT_BLOCK);

			// Перенос сделан вручную (preventDefault) — браузер к новой строке не прокрутит
			this.__scrollCaretIntoView();

			this.__clearPendingFormats();
			this.__emitChange();
			formatToolbar.refresh();
			return;
		}

		// Backspace в начале блока возвращает его к обычному тексту — так из цитаты или кода
		// выходят там же, где в них вошли, не трогая содержимого. Дальше по тексту Backspace
		// работает как обычно.
		if (e.key === "Backspace" && !this.readonly && this.multiline) {
			const block = this.currentBlock;
			const selection = block === DEFAULT_BLOCK ? null : this.selection;

			if (selection && atBlockStart(this.editable, selection.getRangeAt(0))) {
				e.preventDefault();
				this.applyBlock(block); // тот же тип — переключение вернёт обычный текст
			}
		}
	}

	private __onPaste(e: ClipboardEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (this.readonly) return;

		const data = e.clipboardData;
		if (!data) return;

		const plain = data.getData("text/plain");
		// форматированную вставку берём из text/html только при включённом форматировании
		const html = this.format && this.formatTools.length ? data.getData("text/html") : "";

		this.__insertExternal(plain, html);
	}

	/**
	 * Общий приём внешнего текста — вставки из буфера и брошенного файла: фильтр хоста, затем
	 * форматированная ветка, затем простой текст. Форматирование приходит двумя путями: text/html
	 * из буфера и, при markdown-хранении, маркеры прямо в тексте — раз значение хранится этой
	 * разметкой, вставленный текст с ней разбирается так же, как разбиралось бы значение.
	 */
	private __insertExternal(plain: string, html: string) {
		// filterPaste решает по тексту: null — отклонить; если хук ИЗМЕНИЛ текст (обрезка по длине,
		// фильтр по типу) — форматирование сохранить нельзя, вставляем очищенный простой текст
		let plainOverride: string | null = null;
		if (this.__opts.filterPaste) {
			const filtered = this.__opts.filterPaste(plain);
			if (filtered == null) {
				this.__reject();
				return;
			}
			if (filtered !== plain) plainOverride = filtered;
		}

		// вставлять только в своё содержимое: выделение вне редактора нам не адресовано
		const selection = this.selection;
		if (!selection) return;

		if (plainOverride == null) {
			const paras = html ? sanitizePastedHtml(html, this.formatTools, this.formatMarkers, this.blockTypes) : [];
			const markdown = this.format && this.formatStorage === "markdown";

			// text/html точнее описывает скопированное, но лишь когда несёт собственную разметку.
			// Голый текст тоже приезжает html-ем — редакторы кода отдают исходник маркдауна
			// строками в <div>, — и такой html не знает ничего сверх text/plain, а маркеры в
			// тексте понимает только разбор разметкой хранения: при плоском html первым идёт он.
			// Документ (абзацы <p>, заголовки, списки) плоским не считается, даже когда в нём
			// нет ни одного тега форматирования: буквальные символы маркеров в тексте страницы
			// видит и её читатель, и разбор превращал бы их в разметку (см. isDocumentHtml).
			const flat = markdown && !hasPastedMarkup(paras) && !isDocumentHtml(html);

			if (flat && this.__pasteMarkdown(plain, selection)) return;
			if (this.__insertPasted(paras, selection)) return;
			if (!flat && markdown && this.__pasteMarkdown(plain, selection)) return;
		}
		this.__pastePlain(plainOverride ?? plain, selection);
	}

	// Простая вставка текста: в multiline — та же модель абзацев и мягких переносов, что и при
	// вставке форматированного (в режиме block пустая строка разделяет абзацы, в break все переносы
	// мягкие); в single-line — одна строка через пробелы.
	private __pastePlain(text: string, selection: Selection) {
		if (!text) return;

		// Внутри блока без инлайновой разметки (код) пробелы значимы: отступы там — часть
		// текста, и обрезка краёв строк ломала бы вставленный код. Пустая строка там — тоже
		// содержимое, а не разделитель абзацев: деление разваливало бы один блок на два.
		const literal = !BLOCK_TYPES[this.currentBlock].inline;
		const lines = literal
			? text.split(/\n/)
			: text.split(/\n/).map((line, index) => (index === 0 ? line.trimEnd() : line.trim()));

		const mode = literal || !this.multiline ? "single" : this.__separateParagraphs ? "block" : "line";

		this.__insertPasted(buildParagraphs(lines, mode), selection);
	}

	/**
	 * Бросок файлов в редактор: текстовые (`text/*`, а без типа — `.md`/`.txt` по имени)
	 * вставляются содержимым тем же путём, что вставка из буфера, — фильтр хоста, разбор
	 * разметкой хранения объявленным набором, история. Любой другой бросок гасится: свободное
	 * перетаскивание прошло бы мимо истории и фильтров хоста.
	 */
	private __onDrop(e: DragEvent) {
		e.preventDefault();

		if (this.readonly) return;

		const files = Array.from(e.dataTransfer?.files ?? []).filter(isTextFile);
		if (!files.length) return;

		// Каретка — в точку броска, если браузер умеет её назвать; иначе остаётся прежняя.
		// Фокус нужен в любом случае: бросают и в поле, которое его ещё не получало, — вставлять
		// тогда некуда, а без каретки focus(true) ставит её в конец.
		this.__caretFromPoint(e.clientX, e.clientY);
		this.focus(true);

		// Файл читается асинхронно: правка на это время придержана, чтобы нормализация между
		// делом не перестроила содержимое под выставленной кареткой.
		const release = this.holdEditing();
		Promise.all(files.map(readFileText))
			.then((texts) => {
				// компонент могли снять, пока файл читался, — вставлять больше некуда
				if (this.__disposed) return;

				// несколько файлов — подряд через пустую строку: это отдельные тексты
				this.__insertExternal(texts.join("\n\n"), "");
			})
			.catch(() => this.__reject())
			.finally(release);
	}

	/** Ставит каретку в точку на экране, если браузер умеет её назвать, и точка — в редакторе. */
	private __caretFromPoint(x: number, y: number) {
		// стандартное API и его вебкитовский предшественник; в jsdom нет обоих
		const doc = this.editable.ownerDocument as Document & {
			caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
			caretRangeFromPoint?(x: number, y: number): Range | null;
		};

		let node: Node | null = null;
		let offset = 0;
		if (doc.caretPositionFromPoint) {
			const position = doc.caretPositionFromPoint(x, y);
			if (position) ({ offsetNode: node, offset } = position);
		} else if (doc.caretRangeFromPoint) {
			const range = doc.caretRangeFromPoint(x, y);
			if (range) ({ startContainer: node, startOffset: offset } = range);
		}

		if (!node || !this.editable.contains(node)) return;

		const selection = documentSelection(this.editable);
		if (!selection) return;

		const range = doc.createRange();
		range.setStart(node, offset);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	// Вставка простого текста разметкой хранения (markdown): разбор тем же deserialize и с теми же
	// наборами, что у значения, — маркеры снятых инструментов остаются текстом, как остались бы
	// в значении. Возвращает false, если вставлять нечего или разбирать нельзя.
	private __pasteMarkdown(text: string, selection: Selection): boolean {
		// внутри блока без инлайновой разметки (код) текст литерален — как и при простой вставке
		if (!BLOCK_TYPES[this.currentBlock].inline) return false;

		return this.__insertPasted(
			parsePastedMarkdown(
				text,
				this.__valueTools,
				this.formatMarkers,
				this.blockTypes,
				this.__separateParagraphs
			),
			selection
		);
	}

	/**
	 * Вставляет разобранные абзацы в каретку (или вместо выделения) и ставит каретку в конец
	 * вставленного. Возвращает false, если вставлять было нечего: в этом случае содержимое
	 * не трогается вовсе — иначе выделение оказалось бы удалено без замены и без уведомления.
	 *
	 * multiline сохраняет абзацы <p> и мягкие переносы <br>, single-line сводит их к пробелам.
	 * Каретку адресуем текстовым смещением: узлы вставки при разбиении абзаца переезжают.
	 */
	private __insertPasted(paras: HTMLElement[], selection: Selection): boolean {
		if (!paras.length) return false;

		const range = selection.getRangeAt(0);
		this.__history?.record("op");

		const spanned = !range.collapsed;
		range.deleteContents();
		if (spanned && this.multiline) collapseEmptyEdges(this.editable, range);

		const start = selectionCharBounds(this.editable, range)[0];
		let caret: number;

		if (this.multiline) {
			// Длина вставки меряется по факту — разницей длины содержимого: ensureParagraphs
			// подчищает вставленное (краевые <br>-заполнители), и посчитанная заранее длина
			// уводила бы каретку за конец вставленного, в чужой текст.
			const before = charLength(this.editable);

			insertPastedParagraphs(this.editable, paras, range);
			ensureParagraphs(this.editable); // заполнить пустые абзацы, убрать краевые <br>

			caret = start + (charLength(this.editable) - before);
		} else {
			// инлайн: абзацы и переносы → пробелы, форматирование сохраняем
			const doc = this.editable.ownerDocument;
			const fragment = doc.createDocumentFragment();
			paras.forEach((p, index) => {
				if (index > 0) fragment.appendChild(doc.createTextNode(" "));
				while (p.firstChild) fragment.appendChild(p.firstChild);
			});
			fragment.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode(" ")));

			caret = start + (fragment.textContent ?? "").length;
			range.insertNode(fragment);
		}

		restoreSelection(this.editable, caret, caret, selection);
		this.__emitChange();

		return true;
	}

	// --- форматирование ---

	// Единый beforeinput: гашение нативной отмены, readonly-блокировка, режим набора и запись истории.
	private __onBeforeInput(e: InputEvent) {
		// Нативная отмена в contenteditable приходит сюда (historyUndo/Redo). Саму операцию выполняет
		// keydown-обработчик (надёжно во всех состояниях), здесь лишь ГАСИМ нативный undo, чтобы он
		// не конфликтовал с нашей историей (особенно после ручных правок форматирования).
		// keydown всегда предшествует beforeinput, поэтому двойного срабатывания нет.
		if (this.__history && (e.inputType === "historyUndo" || e.inputType === "historyRedo")) {
			e.preventDefault();
			return;
		}

		if (this.readonly) {
			// readonly — запрет любых правок (ввод, удаление, вставка, IME); выделение/копирование остаются
			e.preventDefault();
			return;
		}

		// Фильтр хоста на keydown видит только физические нажатия. IME, автозамена, автодополнение
		// и голосовой ввод приходят сразу сюда, поэтому те же ограничения проверяем и на beforeinput —
		// иначе через них в поле попадает что угодно.
		const filterChar = this.__opts.filterChar;
		if (filterChar && FILTERED_INPUT_TYPES.has(e.inputType) && e.data) {
			if (!Array.from(e.data).every((char) => filterChar(char))) {
				e.preventDefault();
				this.__reject();
				return;
			}
		}

		// режим набора: оборачиваем вводимый текст в ожидающие форматы
		if (this.__pendingFormats.size > 0 && e.inputType === "insertText" && e.data != null) {
			e.preventDefault();
			this.__history?.record("op");
			this.__insertText(e.data);
			return;
		}

		// запоминаем состояние до нативной печати/удаления для собственного undo
		if (this.__history && NATIVE_EDIT_TYPES.has(e.inputType)) this.__history.record("type");
	}

	private __clearPendingFormats() {
		if (!this.__pendingFormats.size) return;
		this.__pendingFormats.clear();
		formatToolbar.refresh();
	}

	private __insertText(data: string) {
		const selection = this.selection;
		if (!selection) return;

		// Замена выделенного не должна терять его оформление. Физически вставка часто оказывается
		// снаружи тега: границы выделения восстанавливаются по текстовым смещениям, а смещение на
		// стыке узлов достаётся соседнему — тому, что вне тега; сам же тег после удаления текста
		// остаётся пустым и убирается. Поэтому форматы, покрывавшие выделение целиком, переносим
		// на вставляемый текст явно. Каретке без выделения это не нужно: там вставка и так попадает
		// внутрь тега, а на его границе принадлежность неочевидна.
		const range = selection.getRangeAt(0);
		const inherited = range.collapsed ? [] : activeFormats(this.editable, range, this.formatTools);
		const formats = new Set([...this.__pendingFormats, ...inherited]);
		// Адрес наследуемой ссылки читается до правки: после deleteContents исходный тег
		// пустеет и убирается, и адреса взять уже неоткуда.
		const href = formats.has("link") ? (linkAt(this.editable, range)?.getAttribute("href") ?? "") : "";

		insertFormattedText(this.editable, data, Array.from(formats), selection, href);

		// В пустом поле абзацев ещё нет, и каретке некуда встать внутрь — вставка из кода
		// (смайлик, переменная) ложится прямо в редактор. Приводим к модели абзацев тем же
		// способом, что и обработчик input при печати: он на программную вставку не приходит,
		// а без <p> следующий Enter правит текст мимо абзаца.
		if (this.multiline) this.__ensureParagraphs();

		// Вставка сдвинула каретку; пока фокус отпущен, её место хранит снимок — обновляем,
		// иначе следующая вставка (второй смайлик подряд) легла бы по старому смещению,
		// ПЕРЕД только что вставленным.
		if (this.__detachedCaret) this.__detachedCaret = this.caretSnapshot() ?? this.__detachedCaret;

		this.__scrollCaretIntoView(); // вставка из кода браузерной прокрутки к каретке не даёт

		this.__emitChange();
		formatToolbar.refresh();
	}
}
