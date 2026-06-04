import "./textbox.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { IS_TOUCH_DEVICE } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui";
import { FuncHelper } from "@brandup/ui-helpers";
import {
	FORMAT_TOOLS,
	HOTKEY_TOOLS,
	defaultFormatMarkers,
	deserialize,
	insertFormattedText,
	isFormatActive,
	normalizeWhitespace,
	parseFormatTools,
	selectionCharBounds,
	serialize,
	toggleFormat,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
} from "./format";
import copyIcon from "../svg/copy.svg";
import doneIcon from "../svg/tick.svg";
import boldIcon from "../svg/bold.svg";
import italicIcon from "../svg/italic.svg";
import strikeIcon from "../svg/strike.svg";
import underlineIcon from "../svg/underline.svg";

const FORMAT_ICONS: Record<FormatTool, string> = {
	bold: boldIcon,
	italic: italicIcon,
	strike: strikeIcon,
	underline: underlineIcon,
};

export const ROOT_CLASS = "ui-textbox";
export const INPUT_CLASS = "textbox-input";
export const MINIATURE_CLASS = "textbox-miniature";
export const CHANGE_EVENT = "textbox-change";
export const MAX_EMAIL_LENGTH = 256; // https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3

export type TextBoxType = "text" | "email" | "url" | "tel" | "number";

type TextBoxEvents = {
	[CHANGE_EVENT]: (data: ChangeEventData) => void;
};

export default class TextBox extends InputControl<HTMLInputElement | HTMLTextAreaElement, TextBoxEvents> {
	private __inputElem: HTMLElement;
	private __symbolsCountElem: HTMLElement;
	private __listenerAbort = new AbortController();
	private __formatButtons: Array<[FormatTool, HTMLButtonElement]> = [];
	private __pendingFormats = new Set<FormatTool>(); // режим набора: форматы для следующего ввода

	readonly type: TextBoxType;
	readonly allowEmptyStrings: boolean;
	readonly multyline: boolean;
	readonly placeholder: string | null;
	readonly copyButton: boolean;
	readonly maxlength: number;
	readonly inputmode: string;
	readonly symbolCounter: boolean;
	readonly autoFocus: boolean;
	readonly format: boolean;
	readonly formatStorage: FormatStorage;
	readonly formatTools: FormatTool[];
	readonly formatMarkers: FormatMarkers;

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement) {
		// определяем тип ввода и нормализуем валидационные атрибуты до super()
		let type: TextBoxType = "text";
		if (valueElem instanceof HTMLInputElement) {
			switch (valueElem.type) {
				case "text":
					type = "text";
					break;
				case "email":
					type = "email";
					if (!valueElem.maxLength || valueElem.maxLength > MAX_EMAIL_LENGTH)
						valueElem.maxLength = MAX_EMAIL_LENGTH;
					break;
				case "url":
					type = "url";
					break;
				case "tel":
					type = "tel";
					break;
				case "number":
					type = "number";
					valueElem.step = "1"; // Поддерживаем пока что только целые числа
					break;
				default:
					throw new Error(`Тип ввода ${valueElem.type} не поддерживается.`);
			}
		}

		valueElem.classList.add(INPUT_CLASS);

		const maxlength = valueElem.maxLength;
		const symbolCounter = valueElem.hasAttribute("data-symbolcounter");
		const autoFocus = valueElem.hasAttribute("data-autofocus");
		const allowEmptyStrings = valueElem.hasAttribute("data-allow-empty-strings");
		const placeholder = valueElem.getAttribute("placeholder");
		const inputmode = valueElem.inputMode;
		const multyline = valueElem instanceof HTMLTextAreaElement;
		const copyButton = valueElem.hasAttribute("data-copy-button") || valueElem.hasAttribute("data-copybutton");
		const disabled = valueElem.disabled;
		const readonly = valueElem.hasAttribute("readonly") || valueElem.hasAttribute("data-readonly");

		// форматирование доступно только для обычного текстового ввода
		const format = type === "text" && valueElem.hasAttribute("data-format");
		const formatStorage: FormatStorage =
			valueElem.getAttribute("data-format-storage") === "markdown" ? "markdown" : "html";
		const formatTools = format ? parseFormatTools(valueElem.getAttribute("data-format-tools")) : [];

		// markdown-маркеры с дефолтами, переопределяются атрибутами data-format-md-<tool>
		const formatMarkers = defaultFormatMarkers();
		if (format) {
			for (const tool of Object.keys(formatMarkers) as FormatTool[]) {
				const marker = valueElem.getAttribute(`data-format-md-${tool}`)?.trim();
				if (marker) formatMarkers[tool] = marker;
			}
		}

		const inputElem = DOM.tag("div", { class: "input" });
		const actionsElem = DOM.tag("div", { class: "actions" });
		const symbolsCountElem = DOM.tag("div", { class: "symbols" });

		const container = DOM.tag("div", { class: [ROOT_CLASS].concat(Array.from(valueElem.classList)) }, [
			DOM.tag("div", { class: "decorator" }),
			DOM.tag("div", { class: "editor" }, [inputElem, symbolsCountElem]),
			actionsElem,
		]);

		container.classList.remove(INPUT_CLASS);

		inputElem.tabIndex = valueElem.tabIndex;
		valueElem.tabIndex = -1;

		if (multyline) container.classList.add("multyline");
		if (symbolCounter) container.classList.add("counter");

		if (disabled) inputElem.tabIndex = -1;
		else inputElem.contentEditable = "true";

		if (inputmode) inputElem.inputMode = inputmode;

		// панель форматирования — кнопки в той же области, что и кнопка копирования
		const formatButtons: Array<[FormatTool, HTMLButtonElement]> = [];
		if (format && formatTools.length && !disabled && !readonly) {
			const toolbarElem = DOM.tag("div", { class: "format-toolbar" });
			for (const tool of formatTools) {
				const def = FORMAT_TOOLS[tool];
				const buttonElem = DOM.tag(
					"button",
					{
						type: "button",
						class: "format-button",
						command: def.command,
						"data-format-tool": tool,
						title: def.title,
					},
					FORMAT_ICONS[tool]
				);
				toolbarElem.insertAdjacentElement("beforeend", buttonElem);
				formatButtons.push([tool, buttonElem]);
			}
			// плавающая панель над контролом, видимость управляется классом .focused
			container.insertAdjacentElement("beforeend", toolbarElem);
		}

		if (copyButton) {
			const buttonElem = DOM.tag(
				"button",
				{ command: "copy-text", title: "Скопировать в буфер обмена" },
				copyIcon
			);
			if (disabled) buttonElem.disabled = true;
			actionsElem.insertAdjacentElement("beforeend", buttonElem);
		}

		inputElem.setAttribute("data-placeholder", placeholder ?? "");

		// убираем висящую миниатюру, если есть, и вставляем container на место valueElem
		if (valueElem.nextElementSibling) {
			const nextElem = valueElem.nextElementSibling as HTMLElement;
			if (nextElem.classList.contains(MINIATURE_CLASS)) nextElem.remove();
		}
		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		super("BrandUp.TextBox", container, valueElem);

		this.type = type;
		this.maxlength = maxlength;
		this.symbolCounter = symbolCounter;
		this.autoFocus = autoFocus;
		this.allowEmptyStrings = allowEmptyStrings;
		this.placeholder = placeholder;
		this.inputmode = inputmode;
		this.multyline = multyline;
		this.copyButton = copyButton;
		this.format = format;
		this.formatStorage = formatStorage;
		this.formatTools = formatTools;
		this.formatMarkers = formatMarkers;

		this.__inputElem = inputElem;
		this.__symbolsCountElem = symbolsCountElem;
		this.__formatButtons = formatButtons;

		this.__initLogic();
		this.__initFormat();
		this.__initText();
	}

	private __initLogic() {
		const { signal } = this.__listenerAbort; // один AbortController отписывает все listener'ы в destroy

		this.element.addEventListener("drop", (e) => e.preventDefault(), { signal });
		this.element.addEventListener("dragenter", (e) => e.preventDefault(), { signal });

		this.__valueElem.addEventListener(
			"change",
			(e: Event) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			},
			{ signal }
		);

		let hasInputClick = false;
		this.__inputElem.addEventListener(
			"mousedown",
			() => {
				if (this.disabled) return;

				hasInputClick = true;
			},
			{ signal }
		);

		this.__inputElem.addEventListener(
			"focus",
			() => {
				if (this.disabled) return;

				this.element.classList.add("focused");

				if (this.readonly) this.__selectAll();
				else if (!hasInputClick) this.__carretToEnd(); // пыремещаем курсов в конец, если клик не по строке
			},
			{ signal }
		);

		this.__inputElem.addEventListener(
			"blur",
			() => {
				hasInputClick = false;

				if (this.disabled) return;

				this.element.classList.remove("focused");

				// когда удаляем весь текст, то браузер оставляет один BR, что означает что текста нет
				// удалить BR нужно, чтобы появился placeholder
				if (this.__inputElem.firstChild?.nodeName === "BR") DOM.empty(this.__inputElem);

				// редактирование завершено — нормализуем пробелы (с событием change, если что-то изменилось)
				this.__normalizeWhitespace(true);
			},
			{ signal }
		);

		this.__inputElem.addEventListener(
			"dblclick",
			() => {
				if (this.disabled) return;

				if (this.copyButton && this.readonly) {
					this.__selectAll();
					return;
				}

				// браузер при выделении слова может захватить пробел у границы — убираем его
				this.__trimSelectionWhitespace();
			},
			{ signal }
		);

		this.element.addEventListener(
			"paste",
			(e: ClipboardEvent) => {
				e.preventDefault();
				e.stopPropagation();

				if (this.readonly || this.disabled) return false;

				let pastedData = e.clipboardData?.getData("text/plain");
				if (!pastedData) return false;

				if (this.type == "number") {
					const numberData = /[\d\s]+/.exec(pastedData);
					if (numberData && numberData.length) pastedData = numberData[0].replace(/\s/g, "");
					else {
						this.element.classList.add("incorrect");
						window.setTimeout(() => this.element.classList.remove("incorrect"), 300);
						return false;
					}
				}

				const selection = window.getSelection();
				if (!selection) return false; // TODO

				if (this.maxlength > 0) {
					// обрезаем вставляемый текст по кол-ву оставшихся символов для ввода

					const selectionLength = selection.toString().length;
					const currentTextLength = this.__getTextLength();
					const leftSymbols = this.maxlength - currentTextLength + selectionLength; // осталось символов для ввода

					if (pastedData.length > leftSymbols) pastedData = pastedData.substring(0, leftSymbols);
				}

				const lines = pastedData.split(/\n/);
				// тримим все строки, кроме начала первой строки, вдруг так нужно
				const output = lines.map((line, index) => (index === 0 ? line.trimEnd() : line.trim()));

				const fragment = document.createDocumentFragment();
				if (!this.multyline) {
					fragment.appendChild(document.createTextNode(output.join(" ")));
				} else {
					output.forEach((line, index) => {
						if (index > 0) fragment.appendChild(document.createElement("br"));

						fragment.appendChild(document.createTextNode(line));
					});
				}

				// Удаляем выделенную область
				selection.getRangeAt(0).deleteContents();

				// Вставляем текст
				selection.getRangeAt(0).insertNode(fragment);

				// Перемещаем курсор в конец вставленной области
				selection.setPosition(selection.focusNode, selection.focusOffset);

				this.__applyValue();

				return true;
			},
			{ signal }
		);

		this.__inputElem.addEventListener(
			"keydown",
			(e: KeyboardEvent) => {
				// хоткеи форматирования (Ctrl/Cmd+B/I/U); зачёркивание — только кнопкой
				if (this.format && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
					const tool = HOTKEY_TOOLS[e.key.toLowerCase()];
					if (tool) {
						e.preventDefault();
						e.stopPropagation();

						// перехватываем даже отключённый инструмент, чтобы не сработало форматирование браузера
						if (this.formatTools.includes(tool)) this.__applyFormat(tool);
						return false;
					}
				}

				const isChar = e.key.length === 1;

				if ((this.readonly || this.disabled) && isChar && !e.ctrlKey) {
					e.preventDefault();
					e.stopPropagation();
					return false;
				}

				if (this.maxlength > 0 && isChar && !e.ctrlKey) {
					const currentTextLength = this.__getTextLength();
					if (currentTextLength >= this.maxlength) {
						e.preventDefault();
						e.stopPropagation();

						this.__toIncorrect();
						return false;
					}
				}

				if (isChar && !e.ctrlKey) {
					let isIncorrect = false;

					switch (this.type) {
						case "number":
							if (!/\d/.test(e.key)) isIncorrect = true;
							break;
						case "email":
							if (!/[a-zA-Z\d.\-_@]/.test(e.key)) isIncorrect = true;
							break;
					}

					if (isIncorrect) {
						e.preventDefault();
						e.stopPropagation();

						this.__toIncorrect();
						return false;
					}
				}

				if (!this.multyline && (e.key == "U+000A" || e.key == "Enter")) {
					// Если однострочный режим и нажат enter, то отправляем submit формы
					e.preventDefault();
					this.__submitForm();
					return false;
				}

				return true;
			},
			{ signal }
		);

		this.__inputElem.addEventListener(
			"input",
			() => {
				if (this.multyline && this.__inputElem.children.length === 1) {
					const child = this.__inputElem.children.item(0);
					if (child && child.tagName === "BR") this.__inputElem.innerHTML = "";
				}

				this.__applyValue();

				let clearInvalidState = true;

				if (this.element.classList.contains("invalid")) clearInvalidState = this.validate(); // Если уже не валидно, то перепроверяем

				if (clearInvalidState) this.element.classList.remove("invalid");
			},
			{ signal }
		);

		this.registerCommand("copy-text", async (context) => {
			if (!window.navigator.clipboard || this.disabled) return;

			await window.navigator.clipboard.writeText(this.__valueElem.value);

			const prevHtml = context.target.innerHTML;
			context.target.innerHTML = doneIcon;
			context.target.classList.add("success");

			const abort = new AbortController();
			await FuncHelper.delay(2000, abort.signal);

			context.target.innerHTML = prevHtml;
			context.target.classList.remove("success");
		});
	}

	private __initFormat() {
		if (!this.format || !this.__formatButtons.length) return;

		const { signal } = this.__listenerAbort;

		for (const [tool, buttonElem] of this.__formatButtons) {
			// не даём кнопке забрать фокус, иначе теряется выделение в редакторе
			buttonElem.addEventListener("mousedown", (e) => e.preventDefault(), { signal });

			this.registerCommand(FORMAT_TOOLS[tool].command, () => this.__applyFormat(tool));
		}

		// подсветка активных инструментов по текущему выделению
		document.addEventListener(
			"selectionchange",
			() => {
				if (document.activeElement === this.element || this.element.contains(document.activeElement))
					this.__refreshFormatState();
			},
			{ signal }
		);

		// режим набора: оборачиваем вводимый текст в ожидающие форматы
		this.__inputElem.addEventListener(
			"beforeinput",
			(e: InputEvent) => {
				if (this.disabled || this.readonly || this.__pendingFormats.size === 0) return;
				if (e.inputType !== "insertText" || e.data == null) return;

				e.preventDefault();
				this.__insertPendingText(e.data);
			},
			{ signal }
		);

		// перемещение каретки/клик/потеря фокуса — выходим из режима набора
		const navKeys = [
			"ArrowLeft",
			"ArrowRight",
			"ArrowUp",
			"ArrowDown",
			"Home",
			"End",
			"PageUp",
			"PageDown",
			"Escape",
		];
		this.__inputElem.addEventListener(
			"keydown",
			(e: KeyboardEvent) => {
				if (navKeys.includes(e.key)) this.__clearPendingFormats();
			},
			{ signal }
		);
		this.__inputElem.addEventListener("mousedown", () => this.__clearPendingFormats(), { signal });
		this.__inputElem.addEventListener("blur", () => this.__clearPendingFormats(), { signal });
	}

	private __clearPendingFormats() {
		if (!this.__pendingFormats.size) return;

		this.__pendingFormats.clear();
		this.__refreshFormatState();
	}

	private __insertPendingText(data: string) {
		const selection = window.getSelection();
		if (!selection || !this.__inputElem.contains(selection.anchorNode)) return;

		insertFormattedText(this.__inputElem, data, Array.from(this.__pendingFormats), selection);

		this.__applyValue();
		this.__refreshFormatState();
	}

	private __applyFormat(tool: FormatTool) {
		if (!this.format || this.readonly || this.disabled || !this.formatTools.includes(tool)) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		// выделение должно быть внутри редактора (не вызываем focus() — он схлопнул бы выделение)
		if (!this.__inputElem.contains(selection.anchorNode)) return;

		// запоминаем исходное выделение/каретку, чтобы вернуть его после форматирования
		const original = selectionCharBounds(this.__inputElem, selection.getRangeAt(0));

		// форматируем слова целиком: и при курсоре без выделения, и при выделении части слова
		this.__expandSelectionToWords(selection);

		const range = selection.getRangeAt(0);
		if (range.collapsed) {
			// под кареткой нет слова (пробелы/пустое поле) — режим набора: запоминаем формат для следующего ввода
			if (this.__pendingFormats.has(tool)) this.__pendingFormats.delete(tool);
			else this.__pendingFormats.add(tool);

			this.__refreshFormatState();
			return;
		}

		this.__pendingFormats.clear(); // есть что форматировать — режим набора не нужен

		// формат применяется к слову, но восстанавливаем исходное выделение пользователя
		toggleFormat(this.__inputElem, range, tool, selection, original);

		this.__applyValue();
		this.__refreshFormatState();
	}

	private __expandSelectionToWords(selection: Selection) {
		const range = selection.getRangeAt(0);

		const { startContainer, endContainer } = range;
		let startOffset = range.startOffset;
		let endOffset = range.endOffset;

		// начало выделения — влево до начала слова
		if (startContainer.nodeType === Node.TEXT_NODE && this.__inputElem.contains(startContainer)) {
			const text = startContainer.textContent ?? "";
			while (startOffset > 0 && !/\s/.test(text[startOffset - 1])) startOffset--;
		}

		// конец выделения — вправо до конца слова
		if (endContainer.nodeType === Node.TEXT_NODE && this.__inputElem.contains(endContainer)) {
			const text = endContainer.textContent ?? "";
			while (endOffset < text.length && !/\s/.test(text[endOffset])) endOffset++;
		}

		if (startOffset === range.startOffset && endOffset === range.endOffset) return; // границы не изменились

		const expanded = document.createRange();
		expanded.setStart(startContainer, startOffset);
		expanded.setEnd(endContainer, endOffset);
		selection.removeAllRanges();
		selection.addRange(expanded);
	}

	private __refreshFormatState() {
		if (!this.format) return;

		const selection = window.getSelection();
		const range =
			selection && selection.rangeCount > 0 && this.__inputElem.contains(selection.anchorNode)
				? selection.getRangeAt(0)
				: null;

		for (const [tool, buttonElem] of this.__formatButtons) {
			const active =
				this.__pendingFormats.has(tool) || (range ? isFormatActive(this.__inputElem, range, tool) : false);
			buttonElem.classList.toggle("active", active);
		}
	}

	private __initText() {
		DOM.empty(this.__inputElem);

		const text = this.__valueElem.value;
		if (text) {
			if (this.format) {
				this.__inputElem.innerHTML = deserialize(
					text,
					this.formatStorage,
					this.formatTools,
					this.formatMarkers
				);
			} else {
				const lines = text.split(/\n/);
				lines.forEach((line, index) => {
					line = line.trim();

					if (index === 0) this.__inputElem.append(document.createTextNode(line));
					else {
						const lineElem = document.createElement("div");
						lineElem.textContent = line;
						this.__inputElem.append(lineElem);
					}
				});
			}
		}

		this.__normalizeWhitespace(false); // нормализация после инициализации/setValue (без события)

		this.__refreshSymbolsCount();

		if (this.autoFocus && !IS_TOUCH_DEVICE && !this.disabled && !this.readonly) this.__inputElem.focus();
	}

	private __applyValue(silent = false) {
		const newValue = this.format
			? serialize(this.__inputElem, this.formatStorage, this.formatTools, this.formatMarkers)
			: this.__inputElem.innerText.trim();
		this.__valueElem.value = newValue;

		this.__refreshSymbolsCount();
		if (!silent) this.__onChange();
	}

	// Нормализация пробелов редактора (схлопывание повторов + обрезка краёв строк).
	// Значение пересинхронизируется только если содержимое изменилось; notify=true — c событием change.
	private __normalizeWhitespace(notify: boolean) {
		if (this.disabled || this.readonly) return;

		const before = this.__inputElem.textContent ?? "";
		normalizeWhitespace(this.__inputElem);
		if ((this.__inputElem.textContent ?? "") === before) return;

		this.__applyValue(true);
		if (notify) this.__onChange();
	}

	private __toIncorrect() {
		this.element.classList.add("incorrect");
		window.setTimeout(() => this.element.classList.remove("incorrect"), 200);
	}

	private __refreshSymbolsCount() {
		if (!this.__symbolsCountElem) return;

		const textLength = this.__getTextLength();
		let counterValue: string;

		if (this.maxlength > 0) {
			counterValue = `${textLength}/${this.maxlength}`;
			if (this.maxlength < textLength) this.__symbolsCountElem.classList.add("invalid");
			else this.__symbolsCountElem.classList.remove("invalid");
		} else counterValue = textLength.toString();

		this.__symbolsCountElem.textContent = counterValue;
	}

	private __selectAll() {
		this.__inputElem.focus();

		window.getSelection()?.selectAllChildren(this.__inputElem);
	}

	private __trimSelectionWhitespace() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

		const range = selection.getRangeAt(0);

		// выделение должно оставаться внутри редактора
		if (!this.__inputElem.contains(range.startContainer) || !this.__inputElem.contains(range.endContainer)) return;

		const { startContainer, endContainer } = range;
		let startOffset = range.startOffset;
		let endOffset = range.endOffset;

		// убираем пробелы в начале
		if (startContainer.nodeType === Node.TEXT_NODE) {
			const text = startContainer.textContent ?? "";
			while (startOffset < text.length && /\s/.test(text[startOffset])) startOffset++;
		}

		// убираем пробелы в конце
		if (endContainer.nodeType === Node.TEXT_NODE) {
			const text = endContainer.textContent ?? "";
			while (endOffset > 0 && /\s/.test(text[endOffset - 1])) endOffset--;
		}

		// в пределах одного узла выделение не должно схлопнуться или вывернуться
		if (startContainer === endContainer && startOffset >= endOffset) return;
		if (startOffset === range.startOffset && endOffset === range.endOffset) return;

		const trimmed = document.createRange();
		trimmed.setStart(startContainer, startOffset);
		trimmed.setEnd(endContainer, endOffset);
		selection.removeAllRanges();
		selection.addRange(trimmed);
	}

	private __carretToEnd() {
		const range = document.createRange();
		range.selectNodeContents(this.__inputElem);
		range.collapse(false);
		const sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(range);
		}
	}

	private __getTextLength() {
		// textContent не вставляет \n между блочными детьми (в отличие от innerText), так что multiline-контент считается корректно;
		// заодно работает в jsdom, где innerText не реализован.
		return this.__inputElem.textContent?.length ?? 0;
	}

	private __onChange() {
		this.trigger(CHANGE_EVENT, <ChangeEventData>{
			textbox: this,
			value: this.getValue(),
		});
	}

	onChange(handler: (e: ChangeEventData) => void) {
		this.on(CHANGE_EVENT, handler);
	}

	hasValue(): boolean {
		return !!this.getValue();
	}

	getValue(): string {
		return this.__valueElem.value.trim();
	}

	setValue(value: string): void {
		this.__valueElem.value = value?.trim() ?? "";

		this.__initText();
		this.__onChange();
	}

	override validate(): boolean {
		let isValid = super.validate();
		if (isValid) {
			const value = this.getValue();

			if (this.required && !value) isValid = false;

			if (this.maxlength > 0 && this.maxlength < value.length) isValid = false;
		}

		if (!isValid) this.element.classList.add("invalid");
		else this.element.classList.remove("invalid");

		return isValid;
	}

	override destroy(): void {
		this.__listenerAbort.abort();
		this.__valueElem.tabIndex = this.__inputElem.tabIndex;

		this.element.insertAdjacentElement("afterend", this.__valueElem);
		this.element.remove();

		super.destroy();
	}
}

export interface ChangeEventData {
	textbox: TextBox;
	value: string;
}
