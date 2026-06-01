import { UIElementBound } from "@brandup/ui";
import "./input.less";

type InputType = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FormInput<T> = T extends InputType ? T : never;

export const INPUT_CSS_CLASS = "ui-input";

export abstract class InputControl<T extends InputType, TEvents = {}>
	extends UIElementBound<TEvents>
	implements IInputControl
{
	protected __valueElem: FormInput<T>;
	protected __submitEvent?: (e: SubmitEvent) => void;
	private __invalidEvent?: (e: Event) => void;
	private __isValidating?: boolean; // true, когда выполняется checkValidity в validate.

	constructor(typeName: string, elem: HTMLElement, valueElem: FormInput<T>) {
		super(typeName, elem);

		this.__valueElem = valueElem;

		// то, что раньше делал _onRenderElement-override; теперь применяем после super, чтобы видеть valueElem
		elem.classList.add(INPUT_CSS_CLASS);
		if (this.required) elem.classList.add("required");
		if (this.readonly) elem.classList.add("readonly");
		if (this.disabled) elem.classList.add("disabled");

		this.__initForm();
	}

	get form(): HTMLFormElement | null {
		return this.__valueElem.form;
	}
	get disabled(): boolean {
		return this.__valueElem.disabled;
	}
	get required(): boolean {
		return this.__valueElem.required;
	}
	get readonly(): boolean {
		return this.__valueElem.hasAttribute("readonly") || this.__valueElem.hasAttribute("data-readonly");
	}

	private __initForm() {
		this.__invalidEvent = (e: Event) => {
			e.preventDefault();

			this.__submitForm();
		};
		this.__valueElem.addEventListener("invalid", this.__invalidEvent);

		this.__submitEvent = (e: SubmitEvent) => {
			if ((e.submitter as HTMLButtonElement | null)?.formNoValidate || (<HTMLFormElement>e.target).noValidate)
				return; // Не делаем валидацию, если она отключена в форме или в инициаторе события submit

			if (this.disabled) return;

			if (!this.validate()) {
				if (!e.defaultPrevented) {
					e.stopPropagation();
					this.focus();
				}

				e.preventDefault();
				return;
			}
		};

		if (this.form) this.form.addEventListener("submit", this.__submitEvent);
	}

	protected __submitForm() {
		const form = this.form;
		if (!this.readonly && !this.disabled && form)
			form.dispatchEvent(new SubmitEvent("submit", { submitter: form, cancelable: true }));
	}

	validate(): boolean {
		if (this.__isValidating) return true;

		this.__isValidating = true;
		const result = this.__valueElem.checkValidity();
		this.__isValidating = false;

		return result;
	}

	focus(): void {
		this.__valueElem.focus();
		this.element.scrollIntoView({ block: "center", inline: "center" });
	}

	override destroy() {
		if (this.form && this.__submitEvent) this.form.removeEventListener("submit", this.__submitEvent);

		if (this.__invalidEvent) this.__valueElem.removeEventListener("invalid", this.__invalidEvent);

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
