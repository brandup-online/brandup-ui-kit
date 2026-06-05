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

// Буква физической клавиши (KeyA…KeyZ) — не зависит от раскладки. Для не-латинских раскладок
// (например, кириллицы) e.key даёт другую букву, поэтому хоткеи сверяем и по e.code.
function codeLetter(e: KeyboardEvent): string {
	return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : "";
}

// Совпадает ли нажатие с латинской буквой хоткея — по e.key (латиница/AZERTY) или e.code (кириллица и пр.).
function isHotkeyLetter(e: KeyboardEvent, letter: string): boolean {
	return e.key.toLowerCase() === letter || codeLetter(e) === letter;
}

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
		// хоткеи форматирования (Ctrl/Cmd+B/I/U); зачёркивание — только кнопкой.
		// Сверяем по e.key и e.code — иначе на не-латинской раскладке (кириллица) хоткеи не срабатывают.
		if (this.format && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
			const tool = HOTKEY_TOOLS[e.key.toLowerCase()] ?? HOTKEY_TOOLS[codeLetter(e)];
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
			const z = isHotkeyLetter(e, "z");
			if (z && !e.shiftKey) {
				e.preventDefault();
				this.__undo();
				return;
			}
			if (isHotkeyLetter(e, "y") || (z && e.shiftKey)) {
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

		const data = e.clipboardData;
		if (!data) return;

		const plain = data.getData("text/plain");
		// форматированную вставку берём из text/html только при включённом форматировании
		const html = this.format && this.formatTools.length ? data.getData("text/html") : "";

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

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		if (html && plainOverride == null && this.__pasteHtml(html, selection)) return;
		this.__pastePlain(plainOverride ?? plain, selection);
	}

	// Простая вставка текста: переносы строк — мягкие <br> (multiline) или пробелы (single-line).
	private __pastePlain(text: string, selection: Selection) {
		if (!text) return;

		const lines = text.split(/\n/);
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

	// Вставка форматированного текста из text/html. Возвращает false, если вставлять нечего
	// (тогда вызывающий откатывается на простую вставку). Санитизация до включённых инструментов;
	// multiline сохраняет абзацы <p> и мягкие переносы <br>, single-line — инлайн с пробелами.
	private __pasteHtml(html: string, selection: Selection): boolean {
		// убираем мусорные элементы (Word/браузер: стили, скрипты, заголовок документа)
		const source = document.createElement("template");
		source.innerHTML = html;
		source.content
			.querySelectorAll("script, style, head, meta, link, title, noscript")
			.forEach((el) => el.remove());

		// единый источник санитизации — deserialize (теги-синонимы → канонические, лишнее развёрнуто)
		const clean = deserialize(source.innerHTML, "html", this.formatTools, this.formatMarkers, true);
		const holder = document.createElement("template");
		holder.innerHTML = clean;

		// внешний HTML: пробелы/переводы строк между тегами не значимы — схлопываем,
		// иначе литеральные \n (pre-wrap) и отступы дают лишние переносы
		const textWalker = document.createTreeWalker(holder.content, NodeFilter.SHOW_TEXT);
		for (let t = textWalker.nextNode(); t; t = textWalker.nextNode())
			t.textContent = (t.textContent ?? "").replace(/\s+/g, " ");

		const paras = Array.from(holder.content.children) as HTMLElement[];
		for (const p of paras) this.__trimParagraphEdges(p);

		// отбрасываем пустые краевые абзацы (ведущие/хвостовые \n и <br>-обёртки из буфера),
		// иначе перед и после вставленного текста появляются пустые строки
		while (paras.length && (paras[0].textContent ?? "").trim() === "") paras.shift();
		while (paras.length && (paras[paras.length - 1].textContent ?? "").trim() === "") paras.pop();
		if (!paras.length) return false;

		const range = selection.getRangeAt(0);
		this.__history?.record("op");
		range.deleteContents();

		// каретку ставим по абсолютному текстовому смещению (длина вставки), не отслеживая узлы
		const start = selectionCharBounds(this.editable, range)[0];
		let caretOffset: number;

		if (!this.multiline) {
			// инлайн: абзацы и переносы → пробелы, форматирование сохраняем
			const fragment = document.createDocumentFragment();
			paras.forEach((p, index) => {
				if (index > 0) fragment.appendChild(document.createTextNode(" "));
				while (p.firstChild) fragment.appendChild(p.firstChild);
			});
			fragment.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode(" ")));
			caretOffset = start + (fragment.textContent ?? "").length;
			range.insertNode(fragment);
		} else {
			caretOffset = start + paras.map((p) => p.textContent ?? "").join("").length;
			this.__insertPastedParagraphs(paras, range);
			ensureParagraphs(this.editable); // заполнить пустые абзацы, убрать краевые <br>
		}

		restoreSelection(this.editable, caretOffset, caretOffset, selection);
		this.__emitChange();
		return true;
	}

	// Вставляет санитизированные абзацы <p> в позицию каретки, разбивая текущий абзац.
	private __insertPastedParagraphs(paras: HTMLElement[], range: Range) {
		let para: Node | null = range.startContainer;
		while (para && para !== this.editable && !this.__isBlock(para)) para = para.parentNode;

		// каретка не внутри абзаца (пустой редактор / уровень редактора) — вставляем абзацы как есть
		if (!para || para === this.editable) {
			const ref = this.editable.childNodes[range.startOffset] ?? null;
			for (const p of paras) this.editable.insertBefore(p, ref);
			return;
		}

		const block = para as HTMLElement;

		// хвост текущего абзаца после каретки — выносим, чтобы вернуть в конец вставки
		const tailRange = document.createRange();
		tailRange.selectNodeContents(block);
		tailRange.setStart(range.startContainer, range.startOffset);
		const tail = tailRange.extractContents();

		// первый вставляемый абзац вливается в текущий (после содержимого до каретки)
		while (paras[0].firstChild) block.appendChild(paras[0].firstChild);

		if (paras.length === 1) {
			block.appendChild(tail); // один абзац: содержимое-до + вставка + хвост в одном <p>
			return;
		}

		// остальные абзацы — отдельными <p> после текущего; хвост — в конец последнего
		let anchor: ChildNode = block;
		for (let i = 1; i < paras.length; i++) {
			anchor.after(paras[i]);
			anchor = paras[i];
		}
		paras[paras.length - 1].appendChild(tail);
	}

	// Обрезает пробелы по краям абзаца (после схлопывания) — у крайних текстовых узлов.
	private __trimParagraphEdges(p: HTMLElement) {
		const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
		const texts: Text[] = [];
		for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) texts.push(t);
		if (!texts.length) return;

		texts[0].textContent = (texts[0].textContent ?? "").replace(/^ /, "");
		const last = texts[texts.length - 1];
		last.textContent = (last.textContent ?? "").replace(/ $/, "");
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
