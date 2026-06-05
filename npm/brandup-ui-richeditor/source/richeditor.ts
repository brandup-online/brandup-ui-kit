import "./richeditor.less"; // стили редактора и панели форматирования

import { DOM, UIElementBound } from "@brandup/ui";
import {
	ALL_FORMAT_TOOLS,
	HOTKEY_TOOLS,
	defaultFormatMarkers,
	deserialize,
	ensureParagraphs,
	insertFormattedText,
	isFormatActive,
	normalizeWhitespace,
	restoreSelection,
	selectionCharBounds,
	serialize,
	toggleFormat,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
} from "./format";
import { EditorHistory } from "./history";
import { formatToolbar } from "./toolbar";

export { TOOLBAR_CLASS, formatToolbar, type ToolbarHost } from "./toolbar";

export const ROOT_CLASS = "ui-richeditor"; // редактируемый элемент, к нему привязан UIElement
export const CHANGE_EVENT = "richeditor-change";

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Escape"];

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

export interface RichEditorOptions {
	/** Включает форматирование и панель инструментов. */
	format?: boolean;
	/** Состав инструментов (по умолчанию все). */
	tools?: FormatTool[];
	/** Формат хранения значения при форматировании. */
	storage?: FormatStorage;
	/** Переопределения markdown-маркеров. */
	markers?: Partial<FormatMarkers>;
	/** Текст-заглушка (атрибут data-placeholder). */
	placeholder?: string | null;
	/** Многострочный режим. */
	multiline?: boolean;
	/** Только для чтения — запрещает ввод и изменение текста (но не выделение/копирование). */
	readonly?: boolean;
	/** Контейнер для панели форматирования; по умолчанию document.body (position: fixed над редактором). */
	toolbarContainer?: HTMLElement | null;
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
	readonly formatTools: FormatTool[];
	readonly formatStorage: FormatStorage;
	readonly formatMarkers: FormatMarkers;
	readonly multiline: boolean;
	readonly toolbarContainer: HTMLElement | null;

	private __opts: RichEditorOptions;
	private __abort = new AbortController();
	private __pendingFormats = new Set<FormatTool>();
	private __hasInputClick = false;
	// собственная история undo/redo — только при форматировании (см. ./history)
	private __history: EditorHistory | null = null;

	constructor(editable: HTMLElement, options: RichEditorOptions = {}) {
		const format = !!options.format;
		const multiline = !!options.multiline;
		const readonly = !!options.readonly;
		// форматирование недоступно в режиме только для чтения
		const tools = format && !readonly ? (options.tools ?? ALL_FORMAT_TOOLS.slice()) : [];

		// тулбар общий и живёт в body (см. ./toolbar), поэтому обёртка не нужна —
		// привязываем UIElement прямо к переданному элементу, он же и редактируемый
		editable.classList.add(ROOT_CLASS);

		super("BrandUp.RichEditor", editable);

		this.editable = editable;
		this.__opts = options;
		this.format = format;
		this.formatTools = tools;
		this.formatStorage = options.storage === "markdown" ? "markdown" : "html";
		this.formatMarkers = Object.assign(defaultFormatMarkers(), options.markers);
		this.multiline = multiline;
		this.toolbarContainer = options.toolbarContainer ?? null;
		// история включается вместе с форматированием
		this.__history = format ? new EditorHistory(editable) : null;

		// редактируемость есть всегда; правки в readonly блокируются на beforeinput,
		// при этом остаётся возможность фокуса, выделения и копирования
		editable.contentEditable = "true";

		if (options.placeholder != null) editable.setAttribute("data-placeholder", options.placeholder);
		if (multiline) editable.classList.add("multiline");
		if (readonly) editable.classList.add("readonly");

		this.__initEvents();
		this.__initFormat();

		this.__render(options.value ?? "");
		this.__normalize(false); // нормализация без события (инициализация)
	}

	get readonly(): boolean {
		return !!this.__opts.readonly;
	}

	// формат хранения значения: format → выбранный; plain → markdown без инструментов (\n\n/\n)
	private get __valueStorage(): FormatStorage {
		return this.format ? this.formatStorage : "markdown";
	}
	private get __valueTools(): FormatTool[] {
		return this.format ? this.formatTools : [];
	}

	// --- публичный API ---

	getValue(): string {
		// multiline → модель абзацев (<p>/\n\n) и мягких переносов (<br>/\n)
		return serialize(this.editable, this.__valueStorage, this.__valueTools, this.formatMarkers, this.multiline);
	}

	setValue(value: string): void {
		this.__render(value ?? "");
		this.__normalize(false);
		this.__emitChange();
	}

	getLength(): number {
		// textContent (а не innerText) корректно считает multiline и работает в jsdom
		return this.editable.textContent?.length ?? 0;
	}

	focus(): void {
		this.editable.focus();
	}

	onChange(handler: (e: RichEditorChangeData) => void) {
		this.on(CHANGE_EVENT, handler);
	}

	/** Переключить форматирование инструмента (вызывается общим тулбаром и хоткеями). */
	applyFormat(tool: FormatTool): void {
		if (!this.format || this.readonly || !this.formatTools.includes(tool)) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;
		if (!this.editable.contains(selection.anchorNode)) return;

		// запоминаем исходное выделение, чтобы вернуть его после форматирования
		const original = selectionCharBounds(this.editable, selection.getRangeAt(0));

		// форматируем слова целиком: и при курсоре без выделения, и при выделении части слова
		this.__expandSelectionToWords(selection);

		const range = selection.getRangeAt(0);
		if (range.collapsed) {
			// под кареткой нет слова — режим набора: формат для следующего ввода
			if (this.__pendingFormats.has(tool)) this.__pendingFormats.delete(tool);
			else this.__pendingFormats.add(tool);

			formatToolbar.refresh();
			return;
		}

		this.__pendingFormats.clear();

		this.__history?.record("op");
		toggleFormat(this.editable, range, tool, selection, original);

		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Отменить последнее действие (история ведётся только при форматировании). */
	private __undo(): void {
		if (!this.__history?.undo()) return;
		this.__afterHistory();
	}

	/** Повторить отменённое действие. */
	private __redo(): void {
		if (!this.__history?.redo()) return;
		this.__afterHistory();
	}

	private __afterHistory(): void {
		this.__pendingFormats.clear();
		this.__emitChange();
		formatToolbar.refresh();
	}

	/** Активен ли формат инструмента на текущем выделении (для подсветки кнопки тулбара). */
	isToolActive(tool: FormatTool): boolean {
		if (this.__pendingFormats.has(tool)) return true;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !this.editable.contains(selection.anchorNode)) return false;

		return isFormatActive(this.editable, selection.getRangeAt(0), tool);
	}

	override destroy(): void {
		this.__abort.abort();
		formatToolbar.detach(this);

		// элемент передан хостом — не удаляем его, только снимаем оформление редактора
		this.editable.classList.remove(ROOT_CLASS, "multiline", "readonly", "focused");
		this.editable.removeAttribute("contenteditable");
		this.editable.removeAttribute("data-placeholder");

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
			this.multiline
		);
	}

	private __emitChange() {
		this.trigger(CHANGE_EVENT, <RichEditorChangeData>{ editor: this, value: this.getValue() });
	}

	private __reject() {
		this.__opts.onReject?.();
	}

	// Нормализация пробелов: схлопывание повторов + обрезка краёв строк.
	// Событие change генерируется только при notify=true и реальном изменении.
	private __normalize(notify: boolean) {
		if (this.readonly) return;

		const before = this.editable.textContent ?? "";
		normalizeWhitespace(this.editable);
		if ((this.editable.textContent ?? "") === before) return;

		if (notify) this.__emitChange();
	}

	// --- обработчики ---

	private __initEvents() {
		const { signal } = this.__abort;
		const editable = this.editable;

		this.element.addEventListener("drop", (e) => e.preventDefault(), { signal });
		this.element.addEventListener("dragenter", (e) => e.preventDefault(), { signal });

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

				// показываем общий тулбар над этим редактором
				if (this.format && this.formatTools.length) formatToolbar.attach(this);

				if (this.readonly) this.__selectAll();
				else if (!this.__hasInputClick) this.__caretToEnd();
			},
			{ signal }
		);

		editable.addEventListener(
			"blur",
			() => {
				this.__hasInputClick = false;

				this.element.classList.remove("focused");
				formatToolbar.detach(this);

				// удаляем висящий BR, чтобы появился placeholder
				if (editable.firstChild?.nodeName === "BR") DOM.empty(editable);

				this.__clearPendingFormats();
				this.__normalize(true); // редактирование завершено
			},
			{ signal }
		);

		editable.addEventListener("dblclick", () => this.__trimSelectionWhitespace(), { signal });

		this.element.addEventListener("paste", (e: ClipboardEvent) => this.__onPaste(e), { signal });
		editable.addEventListener("keydown", (e: KeyboardEvent) => this.__onKeydown(e), { signal });

		editable.addEventListener("beforeinput", (e: InputEvent) => this.__onBeforeInput(e), { signal });

		editable.addEventListener(
			"input",
			() => {
				if (this.multiline) {
					// нормализация меняет структуру (обёртка в <p>, удаление <br>) и сбрасывает каретку —
					// запоминаем её позицию по текстовому смещению и восстанавливаем после
					const selection = window.getSelection();
					const caret =
						selection && selection.rangeCount > 0 && editable.contains(selection.anchorNode)
							? selectionCharBounds(editable, selection.getRangeAt(0))
							: null;
					const before = editable.innerHTML;

					ensureParagraphs(editable); // блуждающий текст/div → <p>

					if (caret && selection && editable.innerHTML !== before)
						restoreSelection(editable, caret[0], caret[1], selection);

					// единственный пустой абзац → очищаем, чтобы показать placeholder
					if (editable.children.length === 1) {
						const only = editable.firstElementChild!;
						if (only.tagName === "P" && (only.textContent ?? "") === "") DOM.empty(editable);
					}
				} else if (editable.firstChild?.nodeName === "BR") {
					editable.innerHTML = "";
				}
				this.__emitChange();
			},
			{ signal }
		);
	}

	private __onKeydown(e: KeyboardEvent) {
		// хоткеи форматирования (Ctrl/Cmd+B/I/U); зачёркивание — только кнопкой
		if (this.format && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
			const tool = HOTKEY_TOOLS[e.key.toLowerCase()];
			if (tool) {
				e.preventDefault();
				e.stopPropagation();
				if (this.formatTools.includes(tool)) this.applyFormat(tool);
				return;
			}
		}

		// undo/redo собственной истории (только при форматировании): Ctrl/Cmd+Z — отмена,
		// Ctrl+Y или Ctrl/Cmd+Shift+Z — повтор. Триггерим на keydown (надёжно во всех состояниях,
		// в т.ч. когда нативный undo/redo-стек пуст); сам нативный undo гасим в __onBeforeInput.
		if (this.__history && (e.ctrlKey || e.metaKey) && !e.altKey) {
			const key = e.key.toLowerCase();
			if (key === "z" && !e.shiftKey) {
				e.preventDefault();
				this.__undo();
				return;
			}
			if (key === "y" || (key === "z" && e.shiftKey)) {
				e.preventDefault();
				this.__redo();
				return;
			}
		}

		// перемещение каретки — выход из режима набора
		if (NAV_KEYS.includes(e.key)) this.__clearPendingFormats();

		const isChar = e.key.length === 1;

		if (this.readonly && isChar && !e.ctrlKey) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		if (isChar && !e.ctrlKey && this.__opts.filterChar && !this.__opts.filterChar(e.key)) {
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

			// Shift/Ctrl/Cmd+Enter — мягкий перенос (<br>) внутри абзаца; Enter — новый абзац (<p>)
			if (e.shiftKey || e.ctrlKey || e.metaKey) this.__insertSoftBreak();
			else this.__insertParagraph();

			this.__clearPendingFormats();
			this.__emitChange();
		}
	}

	private __emptyParagraph(): HTMLParagraphElement {
		const p = document.createElement("p");
		p.appendChild(document.createElement("br"));
		return p;
	}

	// Enter в multiline: разбить текущий абзац по каретке на два <p>
	private __insertParagraph() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !this.editable.contains(selection.anchorNode)) return;

		const range = selection.getRangeAt(0);
		this.__history?.record("op");
		range.deleteContents();

		// текущий абзац (ближайший <p>/<div> внутри редактора)
		let para: Node | null = range.startContainer;
		while (para && para !== this.editable && !this.__isBlock(para)) para = para.parentNode;

		// каретка не внутри абзаца — создаём абзац сразу с видимым результатом (иначе Enter «срабатывает со 2-го раза»)
		if (!para || para === this.editable) {
			const next = this.__emptyParagraph();
			if (this.editable.childNodes.length === 0) {
				// пустой редактор: пустая строка-источник + новая строка с кареткой
				this.editable.appendChild(this.__emptyParagraph());
				this.editable.appendChild(next);
			} else {
				// каретка на уровне редактора между/после абзацев — вставляем новый абзац в эту позицию
				const ref = this.editable.childNodes[range.startOffset] ?? null;
				this.editable.insertBefore(next, ref);
			}
			this.__caretToStart(next);
			return;
		}

		// выносим содержимое от каретки до конца абзаца в новый <p>
		const tail = document.createRange();
		tail.selectNodeContents(para);
		tail.setStart(range.endContainer, range.endOffset);
		const fragment = tail.extractContents();

		const next = document.createElement("p");
		next.appendChild(fragment);
		(para as ChildNode).after(next);

		// extractContents в конце абзаца оставляет пустой текст-узел → <p></p> без заполнителя
		// (невидим/нефокусируем, каретка не встаёт). Чистим и ставим <br> в опустевшие абзацы.
		this.__fillEmptyParagraph(para as HTMLElement);
		this.__fillEmptyParagraph(next);

		this.__caretToStart(next);
	}

	// убирает пустые текст-узлы и ставит <br>-заполнитель в пустой абзац (для видимости и каретки)
	private __fillEmptyParagraph(p: HTMLElement) {
		p.normalize(); // удаляет пустые Text-узлы, склеивает соседние
		if (!p.firstChild) p.appendChild(document.createElement("br"));
	}

	// Shift/Ctrl+Enter в multiline: вставить мягкий перенос <br>
	private __insertSoftBreak() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !this.editable.contains(selection.anchorNode)) return;

		const range = selection.getRangeAt(0);
		this.__history?.record("op");
		range.deleteContents();

		const br = document.createElement("br");
		range.insertNode(br);

		// insertNode в конце текст-узла расщепляет его и оставляет пустой хвост — убираем,
		// иначе br.nextSibling != null и заполнитель не ставится (перенос в конце строки не виден)
		const next = br.nextSibling;
		if (next && next.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === "") next.remove();

		const after = document.createRange();
		if (!br.nextSibling) {
			// перенос в конце строки — нужен второй <br>-заполнитель, иначе новая строка не отображается
			// (хвостовой <br> отбрасывается при сериализации)
			const pad = document.createElement("br");
			br.after(pad);
			after.setStartBefore(pad);
		} else {
			after.setStartAfter(br);
		}
		after.collapse(true);
		selection.removeAllRanges();
		selection.addRange(after);
	}

	private __isBlock(node: Node): boolean {
		return (
			node.nodeType === Node.ELEMENT_NODE &&
			((node as Element).tagName === "P" || (node as Element).tagName === "DIV")
		);
	}

	private __caretToStart(node: Node) {
		const range = document.createRange();
		range.setStart(node, 0);
		range.collapse(true);
		const selection = window.getSelection();
		if (selection) {
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	private __onPaste(e: ClipboardEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (this.readonly) return;

		let pasted = e.clipboardData?.getData("text/plain");
		if (!pasted) return;

		if (this.__opts.filterPaste) {
			const filtered = this.__opts.filterPaste(pasted);
			if (filtered == null) {
				this.__reject();
				return;
			}
			pasted = filtered;
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const lines = pasted.split(/\n/);
		const output = lines.map((line, index) => (index === 0 ? line.trimEnd() : line.trim()));

		const fragment = document.createDocumentFragment();
		if (!this.multiline) {
			fragment.appendChild(document.createTextNode(output.join(" ")));
		} else {
			output.forEach((line, index) => {
				if (index > 0) fragment.appendChild(document.createElement("br"));
				fragment.appendChild(document.createTextNode(line));
			});
		}

		const range = selection.getRangeAt(0);
		this.__history?.record("op");
		range.deleteContents();
		range.insertNode(fragment);
		selection.setPosition(selection.focusNode, selection.focusOffset);

		this.__emitChange();
	}

	// --- форматирование ---

	private __initFormat() {
		if (!this.format) return;

		const { signal } = this.__abort;

		// подсветка активных инструментов общего тулбара по текущему выделению
		document.addEventListener(
			"selectionchange",
			() => {
				if (document.activeElement === this.editable || this.editable.contains(document.activeElement))
					formatToolbar.refresh();
			},
			{ signal }
		);
	}

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

		// режим набора: оборачиваем вводимый текст в ожидающие форматы
		if (this.__pendingFormats.size > 0 && e.inputType === "insertText" && e.data != null) {
			e.preventDefault();
			this.__history?.record("op");
			this.__insertPendingText(e.data);
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

	private __insertPendingText(data: string) {
		const selection = window.getSelection();
		if (!selection || !this.editable.contains(selection.anchorNode)) return;

		insertFormattedText(this.editable, data, Array.from(this.__pendingFormats), selection);

		this.__emitChange();
		formatToolbar.refresh();
	}

	private __expandSelectionToWords(selection: Selection) {
		const range = selection.getRangeAt(0);

		const { startContainer, endContainer } = range;
		let startOffset = range.startOffset;
		let endOffset = range.endOffset;

		if (startContainer.nodeType === Node.TEXT_NODE && this.editable.contains(startContainer)) {
			const text = startContainer.textContent ?? "";
			while (startOffset > 0 && !/\s/.test(text[startOffset - 1])) startOffset--;
		}

		if (endContainer.nodeType === Node.TEXT_NODE && this.editable.contains(endContainer)) {
			const text = endContainer.textContent ?? "";
			while (endOffset < text.length && !/\s/.test(text[endOffset])) endOffset++;
		}

		if (startOffset === range.startOffset && endOffset === range.endOffset) return;

		const expanded = document.createRange();
		expanded.setStart(startContainer, startOffset);
		expanded.setEnd(endContainer, endOffset);
		selection.removeAllRanges();
		selection.addRange(expanded);
	}

	// --- выделение/каретка ---

	private __selectAll() {
		this.editable.focus();
		window.getSelection()?.selectAllChildren(this.editable);
	}

	private __caretToEnd() {
		const range = document.createRange();
		// multiline: каретку в конец последнего абзаца (а не на уровень редактора),
		// иначе и ввод, и Enter попадают мимо <p>
		const last = this.multiline ? this.editable.lastElementChild : null;
		range.selectNodeContents(last && this.__isBlock(last) ? last : this.editable);
		range.collapse(false);
		const sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(range);
		}
	}

	private __trimSelectionWhitespace() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

		const range = selection.getRangeAt(0);
		if (!this.editable.contains(range.startContainer) || !this.editable.contains(range.endContainer)) return;

		const { startContainer, endContainer } = range;
		let startOffset = range.startOffset;
		let endOffset = range.endOffset;

		if (startContainer.nodeType === Node.TEXT_NODE) {
			const text = startContainer.textContent ?? "";
			while (startOffset < text.length && /\s/.test(text[startOffset])) startOffset++;
		}
		if (endContainer.nodeType === Node.TEXT_NODE) {
			const text = endContainer.textContent ?? "";
			while (endOffset > 0 && /\s/.test(text[endOffset - 1])) endOffset--;
		}

		if (startContainer === endContainer && startOffset >= endOffset) return;
		if (startOffset === range.startOffset && endOffset === range.endOffset) return;

		const trimmed = document.createRange();
		trimmed.setStart(startContainer, startOffset);
		trimmed.setEnd(endContainer, endOffset);
		selection.removeAllRanges();
		selection.addRange(trimmed);
	}
}
