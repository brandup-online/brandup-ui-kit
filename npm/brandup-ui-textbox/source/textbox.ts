import "./textbox.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { IS_TOUCH_DEVICE } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui";
import { FuncHelper } from "@brandup/ui-helpers";
import RichEditor, {
	defaultFormatMarkers,
	parseFormatTools,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
	type RichEditorOptions,
} from "@brandup/ui-richeditor";
import copyIcon from "../svg/copy.svg";
import doneIcon from "../svg/tick.svg";

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
	private __editor: RichEditor;
	private __inputElem: HTMLElement; // редактируемый элемент (им владеет RichEditor)
	private __symbolsCountElem: HTMLElement;
	private __listenerAbort = new AbortController();

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

		const inputElem = DOM.tag("div");
		const actionsElem = DOM.tag("div", { class: "actions" });
		const symbolsCountElem = DOM.tag("div", { class: "symbols" });

		const container = DOM.tag("div", { class: [ROOT_CLASS].concat(Array.from(valueElem.classList)) }, [
			DOM.tag("div", { class: "decorator" }),
			DOM.tag("div", { class: "editor" }, [inputElem, symbolsCountElem]),
			actionsElem,
		]);

		container.classList.remove(INPUT_CLASS);

		inputElem.tabIndex = disabled ? -1 : valueElem.tabIndex;
		valueElem.tabIndex = -1;

		if (multyline) container.classList.add("multyline");
		if (symbolCounter) container.classList.add("counter");
		if (inputmode) inputElem.inputMode = inputmode;

		if (copyButton) {
			const buttonElem = DOM.tag(
				"button",
				{ command: "copy-text", title: "Скопировать в буфер обмена" },
				copyIcon
			);
			if (disabled) buttonElem.disabled = true;
			actionsElem.insertAdjacentElement("beforeend", buttonElem);
		}

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

		// фильтрация ввода по типу, ограничение длины и обработка submit/ошибок — через хуки RichEditor
		// (RichEditor про maxlength/типы не знает; всё это контролирует TextBox)
		const options: RichEditorOptions = {
			format,
			tools: formatTools,
			storage: formatStorage,
			markers: formatMarkers,
			placeholder,
			multiline: multyline,
			readonly,
			// тулбар позиционируется относительно контейнера TextBox (а не document.body)
			toolbarContainer: container,
			value: valueElem.value,
			onReject: () => this.__toIncorrect(),
			onEnter: () => this.__submitForm(),
		};

		// допустим ли вводимый символ по типу
		const typeAllowsChar = (char: string) => {
			if (type === "number") return /\d/.test(char);
			if (type === "email") return /[a-zA-Z\d.\-_@]/.test(char);
			return true;
		};

		if (type === "number" || type === "email" || maxlength > 0) {
			options.filterChar = (char) => {
				// достигнут лимит длины — отклоняем
				if (maxlength > 0 && this.__editor.getLength() >= maxlength) return false;
				return typeAllowsChar(char);
			};
		}

		if (type === "number" || maxlength > 0) {
			options.filterPaste = (text) => {
				let pasted = text;

				if (type === "number") {
					const numberData = /[\d\s]+/.exec(pasted);
					if (!numberData || !numberData.length) return null;
					pasted = numberData[0].replace(/\s/g, "");
				}

				// обрезаем по количеству оставшихся символов (с учётом замены выделения)
				if (maxlength > 0) {
					const selectionLength = window.getSelection()?.toString().length ?? 0;
					const left = maxlength - this.__editor.getLength() + selectionLength;
					if (pasted.length > left) pasted = pasted.substring(0, Math.max(0, left));
				}

				return pasted;
			};
		}

		this.__editor = new RichEditor(inputElem, options);

		// RichEditor не знает про disabled — отключаем редактирование на стороне TextBox
		// (визуал даёт класс .disabled от InputControl: затемнение, user-select: none)
		if (disabled) inputElem.contentEditable = "false";

		// синхронизируем скрытое поле с нормализованным содержимым редактора (без события)
		this.__valueElem.value = this.__editor.getValue();

		this.__initLogic();
		this.__refreshSymbolsCount();

		if (this.autoFocus && !IS_TOUCH_DEVICE && !disabled && !readonly) this.__editor.focus();
	}

	private __initLogic() {
		const { signal } = this.__listenerAbort;
		const editable = this.__inputElem;

		// изменения редактора → значение формы, счётчик, валидность, событие
		this.__editor.onChange((data) => {
			this.__valueElem.value = data.value;

			this.__refreshSymbolsCount();

			let clearInvalidState = true;
			if (this.element.classList.contains("invalid")) clearInvalidState = this.validate();
			if (clearInvalidState) this.element.classList.remove("invalid");

			this.__onChange();
		});

		// состояние фокуса контрола (рамка/заливка) — на корневом элементе
		editable.addEventListener("focus", () => !this.disabled && this.element.classList.add("focused"), { signal });
		editable.addEventListener("blur", () => !this.disabled && this.element.classList.remove("focused"), { signal });

		// гасим нативный change скрытого поля
		this.__valueElem.addEventListener(
			"change",
			(e: Event) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			},
			{ signal }
		);

		// двойной клик по readonly-полю с кнопкой копирования — выделить всё для копирования
		if (this.copyButton) {
			editable.addEventListener(
				"dblclick",
				() => {
					if (this.disabled || !this.readonly) return;
					editable.focus();
					window.getSelection()?.selectAllChildren(editable);
				},
				{ signal }
			);
		}

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

	private __toIncorrect() {
		this.element.classList.add("incorrect");
		window.setTimeout(() => this.element.classList.remove("incorrect"), 200);
	}

	private __refreshSymbolsCount() {
		if (!this.__symbolsCountElem) return;

		const textLength = this.__editor.getLength();
		let counterValue: string;

		if (this.maxlength > 0) {
			counterValue = `${textLength}/${this.maxlength}`;
			if (this.maxlength < textLength) this.__symbolsCountElem.classList.add("invalid");
			else this.__symbolsCountElem.classList.remove("invalid");
		} else counterValue = textLength.toString();

		this.__symbolsCountElem.textContent = counterValue;
	}

	private __onChange() {
		this.trigger(CHANGE_EVENT, <ChangeEventData>{
			textbox: this,
			value: this.getValue(),
		});
	}

	/** Доступ к встроенному редактору (форматирование, выделение и т.п.). */
	get editor(): RichEditor {
		return this.__editor;
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
		// RichEditor нормализует и сгенерирует change — он синхронизирует скрытое поле и вызовет textbox-change
		this.__editor.setValue(value?.trim() ?? "");
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
		this.__editor.destroy();

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
