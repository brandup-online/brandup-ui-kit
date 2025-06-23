import "./textbox.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { IS_TOUCH_DEVICE } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui-dom";
import { FuncHelper } from "@brandup/ui-helpers";
import copyIcon from "./svg/copy.svg";
import doneIcon from "./svg/tick.svg";

export const ROOT_CLASS = "ui-textbox";
export const INPUT_CLASS = "textbox-input";
export const MINIATURE_CLASS = "textbox-miniature";
export const CHANGE_EVENT = "textbox-change";
export const MAX_EMAIL_LENGTH = 256; // https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3

export type TextBoxType = "text" | "email" | "url" | "tel" | "number";

export default class TextBox extends InputControl<HTMLInputElement | HTMLTextAreaElement> {
	private __inputElem: HTMLElement;
	private __actionsElem: HTMLElement;
	private __symbolsCountElem?: HTMLElement;

	readonly type: TextBoxType;
	readonly allowEmptyStrings: boolean;
	readonly multyline: boolean;
	readonly placeholder: string | null;
	readonly copyButton: boolean;
	readonly maxlength: number;
	readonly inputmode: string;
	readonly symbolCounter: boolean;
	readonly autoFocus: boolean;

	get typeName(): string { return "BrandUp.TextBox"; }

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement) {
		super(valueElem);

		if (this.__valueElem instanceof HTMLInputElement) {
			switch (this.__valueElem.type) {
				case "text":
					this.type = "text";
					break;
				case "email":
					this.type = "email";

					if (!this.__valueElem.maxLength || this.__valueElem.maxLength > MAX_EMAIL_LENGTH)
						this.__valueElem.maxLength = MAX_EMAIL_LENGTH;

					break;
				case "url":
					this.type = "url";
					break;
				case "tel":
					this.type = "tel";
					break;
				case "number":
					this.type = "number";
					this.__valueElem.step = "1"; // Поддерживаем пока что только целые числа
					break;
				default:
					throw new Error(`Тип ввода ${this.__valueElem.type} не поддерживается.`);
			}
		}
		else
			this.type = "text";

		this.__valueElem.classList.add(INPUT_CLASS);

		// Инициализация свойств
		this.maxlength = this.__valueElem.maxLength;
		this.symbolCounter = this.__valueElem.hasAttribute("data-symbolcounter");
		this.autoFocus = this.__valueElem.hasAttribute("data-autofocus");
		this.allowEmptyStrings = this.__valueElem.hasAttribute("data-allow-empty-strings");
		this.placeholder = this.__valueElem.getAttribute("placeholder");
		this.inputmode = this.__valueElem.inputMode;
		this.multyline = valueElem instanceof HTMLTextAreaElement;
		this.copyButton = this.__valueElem.hasAttribute("data-copy-button") || this.__valueElem.hasAttribute("data-copybutton");

		this.__inputElem = DOM.tag("div", { class: "input" });
		this.__actionsElem = DOM.tag("div", { class: "actions" });

		this.__renderUI();
		this.__initLogic();
		this.__initText();
	}

	private __renderUI() {
		const container = DOM.tag("div", { class: [ROOT_CLASS].concat(Array.from(this.__valueElem.classList)) }, [
			DOM.tag("div", { class: "decorator" }),
			DOM.tag("div", "editor", [
				this.__inputElem,
				this.__symbolsCountElem = DOM.tag("div", { class: "symbols" })
			]),
			this.__actionsElem
		]);

		container.classList.remove(INPUT_CLASS);

		this.__inputElem.tabIndex = this.__valueElem.tabIndex;
		this.__valueElem.tabIndex = -1;

		if (this.multyline) container.classList.add("multyline");

		if (this.symbolCounter) container.classList.add("counter");

		if (this.disabled) {
			this.__inputElem.tabIndex = -1;
		}
		else
			this.__inputElem.contentEditable = "true";

		if (this.inputmode) this.__inputElem.inputMode = this.inputmode;

		if (this.copyButton) {
			const buttonElem = <HTMLButtonElement>DOM.tag("button", { command: "copy-text", title: "Скопировать в буфер обмена" }, copyIcon);
			if (this.disabled)
				buttonElem.disabled = true;
			this.__actionsElem.insertAdjacentElement("beforeend", buttonElem);
		}

		this.__inputElem.setAttribute("data-placeholder", this.placeholder ?? "");

		this.setElement(container);

		if (this.__valueElem.nextElementSibling) {
			// Если следующий элемент это миниатюра пока textbox не отрисован
			const nextElem = <HTMLElement>this.__valueElem.nextElementSibling;
			if (nextElem.classList.contains(MINIATURE_CLASS)) nextElem.remove();
		}

		this.__valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", this.__valueElem);
	}

	private __initLogic() {
		if (!this.element)
			return;

		this.element.addEventListener("drop", (e) => e.preventDefault());
		this.element.addEventListener("dragenter", (e) => e.preventDefault());

		this.__valueElem.addEventListener("change", (e: Event) => {
			e.preventDefault();
			e.stopImmediatePropagation();
		});

		let hasInputClick = false;
		this.__inputElem.addEventListener("mousedown", () => {
			if (this.disabled)
				return;

			hasInputClick = true;
		});

		this.__inputElem.addEventListener("focus", () => {
			if (this.disabled)
				return;

			this.element?.classList.add("focused");

			if (this.readonly)
				this.__selectAll();
			else if (!hasInputClick)
				this.__carretToEnd(); // пыремещаем курсов в конец, если клик не по строке
		});

		this.__inputElem.addEventListener("blur", (e) => {
			hasInputClick = false;

			if (this.disabled)
				return;

			this.element?.classList.remove("focused");

			// когда удаляем весь текст, то браузер оставляет один BR, что означает что текста нет
			// удалить BR нужно, чтобы появился placeholder
			if (this.__inputElem.firstChild?.nodeName === "BR")
				DOM.empty(this.__inputElem);
		});

		this.__inputElem.addEventListener("dblclick", () => {
			if (this.disabled)
				return;

			if (this.copyButton && this.readonly)
				this.__selectAll();
		});

		this.element.addEventListener("paste", (e) => {
			e.preventDefault();
			e.stopPropagation();

			if (this.readonly || this.disabled || !this.element) return false;

			let pastedData = e.clipboardData?.getData("text/plain");
			if (pastedData) {
				if (this.type == "number") {
					const numberData = /[\d\s]+/.exec(pastedData);
					if (numberData && numberData.length)
						pastedData = numberData[0].replace(' ', '');
					else {
						this.element.classList.add("incorrect");
						window.setTimeout(() => this.element?.classList.remove("incorrect"), 300);
						return;
					}
				}

				const selection = window.getSelection();
				if (!selection)
					return; // TODO

				if (this.maxlength > 0) {
					// обрезаем вставляемый текст по кол-ву оставшихся символов для ввода

					const selectionLength = selection.toString().length;
					const currentTextLength = this.__getTextLenght();
					const leftSymbols = this.maxlength - currentTextLength + selectionLength; // осталось символов для ввода

					if (pastedData.length > leftSymbols)
						pastedData = pastedData.substring(0, leftSymbols);
				}

				const lines = pastedData.split(/\n/);
				// тримим все строки, кроме начала первой строки, вдруг так нужно
				const output = lines.map((line, index) => index === 0 ? line.trimEnd() : line.trim());

				var fragment = document.createDocumentFragment();
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
			}
		});

		this.__inputElem.addEventListener("keydown", (e: KeyboardEvent) => {
			if (!this.element)
				return;

			const isChar = e.key.length === 1;

			if ((this.readonly || this.disabled) && isChar && !e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();
				return false;
			}

			if (this.maxlength > 0 && isChar && !e.ctrlKey) {
				const currentTextLength = this.__getTextLenght();
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
						if (!/\d/.test(e.key))
							isIncorrect = true;
						break;
					case "email":
						if (!/[a-zA-Z\d\.\-\_\@]/.test(e.key))
							isIncorrect = true;
						break;
				}

				if (isIncorrect) {
					e.preventDefault();
					e.stopPropagation();

					this.__toIncorrect();
					return;
				}
			}

			if (!this.multyline && (e.key == "U+000A" || e.key == "Enter")) {
				// Если однострочный режим и нажат enter, то отправляем submit формы
				e.preventDefault();
				this.__submitForm();
				return false;
			}
		});

		this.__inputElem.addEventListener("input", () => {
			if (!this.element)
				return;

			if (this.multyline && this.__inputElem.children.length === 1) {
				const child = this.__inputElem.children.item(0);
				if (child && child.tagName === "BR")
					this.__inputElem.innerHTML = '';
			}

			this.__applyValue();

			let clearInvalidState = true;

			if (this.element.classList.contains("invalid"))
				clearInvalidState = this.validate(); // Если уже не валидно, то перепроверяем

			if (clearInvalidState)
				this.element.classList.remove("invalid");
		});

		this.registerCommand("copy-text", async context => {
			if (!window.navigator.clipboard || this.disabled) return;

			await window.navigator.clipboard.writeText(this.__valueElem.value)

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
		var html = "";

		const text = this.__valueElem.value;
		if (text) {
			const lines = text.split(/\n/);
			const output = lines.map((line, index) => {
				line = line.trim();

				if (index > 0) line = `<div>${line}</div>`;

				return line;
			});

			html = output.join("");
		}

		this.__inputElem.innerHTML = html;

		this.__refreshSymbolsCount();

		if (this.autoFocus && !IS_TOUCH_DEVICE && !this.disabled && !this.readonly)
			this.__inputElem.focus();
	}

	private __applyValue() {
		let newValue = this.__inputElem.innerText.trim();
		this.__valueElem.value = newValue;

		this.__refreshSymbolsCount();
		this.__onChange();
	}

	private __toIncorrect() {
		if (!this.element)
			return;

		this.element.classList.add("incorrect");
		window.setTimeout(() => this.element?.classList.remove("incorrect"), 200);
	}

	private __refreshSymbolsCount() {
		if (!this.__symbolsCountElem)
			return;

		const textLength = this.__getTextLenght();
		let counterValue: string;

		if (this.maxlength > 0) {
			counterValue = `${textLength}/${this.maxlength}`;
			if (this.maxlength < textLength)
				this.__symbolsCountElem.classList.add("invalid");
			else
				this.__symbolsCountElem.classList.remove("invalid");
		}
		else
			counterValue = textLength.toString();

		this.__symbolsCountElem.textContent = counterValue;
	}

	private __selectAll() {
		this.__inputElem.focus();

		window.getSelection()?.selectAllChildren(this.__inputElem)
	}

	private __carretToEnd() {
		var range = document.createRange();
		range.selectNodeContents(this.__inputElem);
		range.collapse(false);
		var sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(range);
		}
	}

	private __getTextLenght() {
		return this.__inputElem.innerText.length;
	}

	private __onChange() {
		this.trigger(CHANGE_EVENT, { textbox: this, value: this.getValue() });
	}

	onChange(handler: (e: { textbox: TextBox, value: string }) => void) {
		this.on(CHANGE_EVENT, handler);
	}

	hasValue(): boolean {
		return !!this.getValue();
	}

	getValue(): string {
		return this.__valueElem.value?.trim() ?? null;
	}

	setValue(value: string): void {
		this.__valueElem.value = value?.trim() ?? "";

		this.__initText();
		this.__onChange();
	}

	validate(): boolean {
		if (!this.element)
			return false;

		let isValid = super.validate();
		if (isValid) {
			let value = this.getValue();

			if (this.required && !value)
				isValid = false;

			if (this.maxlength > 0 && this.maxlength < value.length)
				isValid = false;
		}

		if (!isValid)
			this.element.classList.add("invalid");
		else
			this.element.classList.remove("invalid");

		return isValid;
	}

	destroy(): void {
		this.__valueElem.tabIndex = this.__inputElem.tabIndex;

		this.element?.insertAdjacentElement("afterend", this.__valueElem);
		this.element?.remove();

		super.destroy();
	}
}

export interface ChangeEventData {
	textbox: TextBox;
	value: string;
}