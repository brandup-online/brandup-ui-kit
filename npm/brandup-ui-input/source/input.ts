import { UIElement } from "@brandup/ui";
import "./input.less";

type allowedTypes = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type formInput<T> = T extends allowedTypes ? T : never;

export const INPUT_CSS_CLASS = "ui-input";

export abstract class InputUIElement<T> extends UIElement implements IInputControl {
	protected __form: HTMLFormElement;
	protected __submitEvent: (e: SubmitEvent) => void;
	protected __valueElem: formInput<T>;

	constructor(valueElem: formInput<T>) {
		super();

		if (!valueElem.form)
			throw new Error('Input element is not in form.');
		this.__form = valueElem.form;

		this.__valueElem = valueElem;

		this.__form.addEventListener("submit", this.__submitEvent = (e: SubmitEvent) => {
			if ((<HTMLButtonElement>e.submitter).formNoValidate || (<HTMLFormElement>e.target).noValidate)
				return; // Не делаем валидацию, если она отключена в форме или в инициаторе события submit
			if (this.disabled)
				return;

			if (!this.validate()) {
				if (!e.defaultPrevented) {
					e.stopPropagation();
					this.focus();
				}
				e.preventDefault();
				return false;
			}
		});

		this.__valueElem.addEventListener("invalid", (e: Event) => {
			e.preventDefault();

			this.__submitForm();
		});
	}

	get form(): HTMLFormElement { return this.__form; }
	get disabled(): boolean { return this.__valueElem.disabled; }
	get required(): boolean { return this.__valueElem.required; }
	get readonly(): boolean { return this.__valueElem.hasAttribute("readonly") || this.__valueElem.hasAttribute("data-readonly"); }

	protected __submitForm() {
		if (!this.readonly && !this.disabled && this.__form && this.__form.dispatchEvent(new SubmitEvent("submit", { submitter: this.__form, cancelable: true })))
			this.__form.submit();
	}

	protected __initState() {
		if (!this.element)
			throw new Error('Not set element.');

		if (this.required) this.element.classList.add("required");
		if (this.readonly) this.element.classList.add("readonly");
		if (this.disabled) this.element.classList.add("disabled");
	}

	validate(): boolean {
		return this.__valueElem.checkValidity();
	}

	focus(): void {
		this.__valueElem.focus();
	}

	destroy() {
		this.__form.removeEventListener("submit", this.__submitEvent);

		super.destroy();
	}
}

export interface IInputControl {
	get disabled(): boolean;
	get required(): boolean;
	get readonly(): boolean;

	validate(): boolean;
	focus(): void;
	destroy(): void;
}