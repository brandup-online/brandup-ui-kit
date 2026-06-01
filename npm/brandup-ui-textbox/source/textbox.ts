import "./textbox.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { IS_TOUCH_DEVICE } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui";
import { FuncHelper } from "@brandup/ui-helpers";
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
	private __inputElem: HTMLElement;
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

		this.__inputElem = inputElem;
		this.__symbolsCountElem = symbolsCountElem;

		this.__initLogic();
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
			},
			{ signal }
		);

		this.__inputElem.addEventListener(
			"dblclick",
			() => {
				if (this.disabled) return;

				if (this.copyButton && this.readonly) this.__selectAll();
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

	private __initText() {
		DOM.empty(this.__inputElem);

		const text = this.__valueElem.value;
		if (text) {
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

		this.__refreshSymbolsCount();

		if (this.autoFocus && !IS_TOUCH_DEVICE && !this.disabled && !this.readonly) this.__inputElem.focus();
	}

	private __applyValue() {
		const newValue = this.__inputElem.innerText.trim();
		this.__valueElem.value = newValue;

		this.__refreshSymbolsCount();
		this.__onChange();
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
