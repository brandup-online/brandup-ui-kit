import { UIElement } from "@brandup/ui";
import "./input.less";

type InputType = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FormInput<T> = T extends InputType ? T : never;

export const INPUT_CSS_CLASS = "ui-input";

export abstract class InputControl<T extends InputType> extends UIElement implements IInputControl {
	protected __valueElem: FormInput<T>;
	protected __submitEvent?: (e: SubmitEvent) => void;
	private __isValidating?: boolean; // true, когда выполняется checkValidity в validate.

	constructor(valueElem: FormInput<T>) {
		super();

		this.__valueElem = valueElem;

		this.__initForm();
	}

	get form(): HTMLFormElement | null { return this.__valueElem.form; }
	get disabled(): boolean { return this.__valueElem.disabled; }
	get required(): boolean { return this.__valueElem.required; }
	get readonly(): boolean { return this.__valueElem.hasAttribute("readonly") || this.__valueElem.hasAttribute("data-readonly"); }

	private __initForm() {
		this.__valueElem.addEventListener("invalid", (e: Event) => {
			e.preventDefault();

			this.__submitForm();
		});

		this.__submitEvent = (e: SubmitEvent) => {
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
		};

		if (this.form)
			this.form.addEventListener("submit", this.__submitEvent);
	}

	protected __submitForm() {
		const form = this.form;
		if (!this.readonly && !this.disabled && form)
			form.dispatchEvent(new SubmitEvent("submit", { submitter: form, cancelable: true }));
	}

	protected _onRenderElement(elem: HTMLElement) {
		elem.classList.add(INPUT_CSS_CLASS);

		if (this.required)
			elem.classList.add("required");
		if (this.readonly)
			elem.classList.add("readonly");
		if (this.disabled)
			elem.classList.add("disabled");
	}

	validate(): boolean {
		if (this.__isValidating)
			return true;

		this.__isValidating = true;
		const result = this.__valueElem.checkValidity();
		this.__isValidating = false;

		return result;
	}

	focus(): void {
		this.__valueElem.focus();
		this.element?.scrollIntoView({ block: "center", inline: "center" });
	}

	destroy() {
		if (this.form && this.__submitEvent)
			this.form.removeEventListener("submit", this.__submitEvent);

		super.destroy();
	}
}

export interface IInputControl {
	get form(): HTMLFormElement | null;
	get disabled(): boolean;
	get required(): boolean;
	get readonly(): boolean;

	validate(): boolean;
	focus(): void;
	destroy(): void;
}