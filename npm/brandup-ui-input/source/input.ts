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
	private __submitCaptureEvent?: (e: Event) => void;
	private __invalidEvent?: (e: Event) => void;
	private __overrides?: ValueElemOverrides;
	private __isValidating?: boolean; // true, когда выполняется checkValidity в validate.

	constructor(typeName: string, elem: HTMLElement, valueElem: FormInput<T>, overrides?: ValueElemOverrides) {
		super(typeName, elem);

		this.__valueElem = valueElem;
		this.__overrides = overrides;

		// то, что раньше делал _onRenderElement-override; теперь применяем после super, чтобы видеть valueElem
		elem.classList.add(INPUT_CSS_CLASS);
		if (this.required) elem.classList.add("required");
		if (this.readonly) elem.classList.add("readonly");
		if (this.disabled) elem.classList.add("disabled");

		this.__initForm();
	}

	/**
	 * Готовит поле-носитель к обёртке контейнером контрола: класс-скрыватель переезжает на поле,
	 * а собственные классы поля — на контейнер, чтобы оформление из разметки применялось к тому,
	 * что видно. Статический, потому что вызывается до `super(...)`.
	 *
	 * Саму вставку в DOM делает контрол: поле встаёт в контейнер первым или последним
	 * в зависимости от вёрстки, и на этот порядок завязаны соседские селекторы в стилях.
	 */
	protected static prepareValueElem(valueElem: HTMLElement, container: HTMLElement, inputClass: string) {
		container.classList.add(...Array.from(valueElem.classList));
		container.classList.remove(inputClass);
		valueElem.classList.add(inputClass);
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

	/**
	 * Довести значение до `__valueElem`, если контрол держит его отдельно и обновляет не мгновенно
	 * (например, редактор с отложенной сериализацией). Вызывается перед каждым чтением значения
	 * снаружи: валидация, отправка формы, сбор `FormData`. По умолчанию ничего не делает —
	 * у контролов, пишущих в поле сразу, синхронизировать нечего.
	 */
	protected __syncValue(): void {}

	private __initForm() {
		this.__invalidEvent = (e: Event) => {
			e.preventDefault();

			this.__submitForm();
		};
		this.__valueElem.addEventListener("invalid", this.__invalidEvent);

		this.__submitEvent = (e: SubmitEvent) => {
			// Значение синхронизируем до любых проверок и независимо от них: при отключённой
			// валидации обработчик выходит ниже, а форма всё равно отправится — уже с этим значением.
			// Событие submit приходит до действия по умолчанию, поэтому успеваем.
			this.__syncValue();

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

		if (!this.form) return;

		this.form.addEventListener("submit", this.__submitEvent);

		// Тот же сброс, но гарантированно раньше любого обработчика самой формы: в фазе перехвата
		// на документе событие приходит до цели, в каком бы порядке ни вешали слушатели. Иначе
		// обработчик submit, повешенный приложением раньше контрола, успел бы собрать FormData
		// со старым значением. Для формы вне документа перехвата не будет — там работает
		// __submitEvent выше.
		//
		// Документ берём у самого поля, а не глобальный: destroy может случиться в любой момент
		// (UIElement разрушает контрол сам, заметив удаление элемента через MutationObserver),
		// и тогда обращаться к глобальному окружению уже небезопасно.
		this.__submitCaptureEvent = (e: Event) => {
			if (e.target === this.form) this.__syncValue();
		};
		this.__valueElem.ownerDocument.addEventListener("submit", this.__submitCaptureEvent, true);
	}

	protected __submitForm() {
		const form = this.form;
		if (!this.readonly && !this.disabled && form)
			form.dispatchEvent(new SubmitEvent("submit", { submitter: form, cancelable: true }));
	}

	validate(): boolean {
		if (this.__isValidating) return true;

		this.__syncValue(); // checkValidity читает поле напрямую

		this.__isValidating = true;
		const result = this.__valueElem.checkValidity();
		this.__isValidating = false;

		return result;
	}

	focus(): void {
		this.__valueElem.focus();
		this.element.scrollIntoView({ block: "center", inline: "center" });
	}

	/**
	 * Возвращает поле-носитель в исходное состояние: снимает класс, которым контрол увёл его
	 * с экрана, возвращает подменённые атрибуты и вынимает поле из контейнера, а сам контейнер
	 * удаляет. Одинаково для всех контролов: поле остаётся в форме, а UI над ним — временный.
	 */
	private __restoreValueElem() {
		if (this.__overrides?.class) this.__valueElem.classList.remove(this.__overrides.class);

		for (const [name, value] of this.__overrides?.attrs ?? []) {
			if (value === null) this.__valueElem.removeAttribute(name);
			else this.__valueElem.setAttribute(name, value);
		}

		// контрол мог и не оборачивать поле (элемент контрола — само поле)
		if (this.element === this.__valueElem || !this.element.parentElement) return;

		this.element.insertAdjacentElement("afterend", this.__valueElem);
		this.element.remove();
	}

	override destroy() {
		if (this.form && this.__submitEvent) this.form.removeEventListener("submit", this.__submitEvent);

		if (this.__submitCaptureEvent)
			this.__valueElem.ownerDocument.removeEventListener("submit", this.__submitCaptureEvent, true);

		if (this.__invalidEvent) this.__valueElem.removeEventListener("invalid", this.__invalidEvent);

		this.__restoreValueElem();

		super.destroy();
	}
}

/**
 * Что контрол навязал полю-носителю и что нужно вернуть при `destroy`.
 *
 * Снимок делается до правок, то есть до `super(...)`, поэтому передаётся снаружи, а не
 * собирается базовым классом.
 */
export interface ValueElemOverrides {
	/** Класс, добавленный полю контролом (обычно уводит его с экрана). */
	class?: string;
	/** Подменённые атрибуты: имя и исходное значение (`null` — атрибута не было). */
	attrs?: [name: string, value: string | null][];
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
