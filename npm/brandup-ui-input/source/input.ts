import { UIElementBound } from "@brandup/ui";
// Из кита берём ровно два признака и берём их напрямую: его общий вход тянет за собой попап,
// модальное окно, стили и @brandup/ui-app — базе ввода это не нужно, а сборке пакета мешает.
import { isCoarsePointer } from "@brandup/ui-kit/source/utils/compatibility";
import { hasUserScrolled } from "@brandup/ui-kit/source/utils/user-scroll";
import "./input.less";

type InputType = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FormInput<T> = T extends InputType ? T : never;

export const INPUT_CSS_CLASS = "ui-input";

/** Контрол, ждущий появления в документе: `__onConnected` возвращает `true`, когда дождался. */
interface ConnectedWaiter {
	__onConnected(): boolean;
}

/**
 * Ждущие контролы — слабыми ссылками, и наблюдатель один на документ.
 *
 * Один на документ, потому что вставку страницы видит любой, а каждый лишний наблюдатель платит
 * обходом всех мутаций документа. Слабыми, потому что контрол, собранный во фрагмент и там же
 * выброшенный, ждать иначе не перестанет: авторазрушение снимает контрол, удалённый из документа,
 * а никогда не вставленный не удаляют — сильная ссылка держала бы и его, и всё его дерево
 * до ухода со страницы.
 *
 * Наблюдатель живёт, только пока есть кого ждать: последнее снятое ожидание его отключает.
 */
const connectedWaiters = new Map<Document, { observer: MutationObserver; waiters: Set<WeakRef<ConnectedWaiter>> }>();

function waitConnected(doc: Document, waiter: WeakRef<ConnectedWaiter>): void {
	let entry = connectedWaiters.get(doc);

	if (!entry) {
		const observer = new MutationObserver(() => {
			const current = connectedWaiters.get(doc);
			if (!current) return;

			for (const ref of [...current.waiters]) {
				const pending = ref.deref();
				if (!pending || pending.__onConnected()) current.waiters.delete(ref); // убранный сборщиком тоже отжил
			}

			if (!current.waiters.size) stopObserving(doc);
		});

		connectedWaiters.set(doc, (entry = { observer, waiters: new Set() }));
		observer.observe(doc, { childList: true, subtree: true });
	}

	entry.waiters.add(waiter);
}

function stopWaitConnected(doc: Document, waiter: WeakRef<ConnectedWaiter>): void {
	const entry = connectedWaiters.get(doc);
	if (!entry?.waiters.delete(waiter) || entry.waiters.size) return;

	stopObserving(doc);
}

function stopObserving(doc: Document): void {
	connectedWaiters.get(doc)?.observer.disconnect();
	connectedWaiters.delete(doc);
}

/** Принимает ли элемент ввод текста — то есть значит ли фокус на нём, что в нём работают. */
const isTextEntry = (elem: Element): boolean =>
	elem instanceof HTMLInputElement ||
	elem instanceof HTMLTextAreaElement ||
	elem instanceof HTMLSelectElement ||
	(elem instanceof HTMLElement && elem.isContentEditable);

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

	/** Объявлен ли автофокус; ставит его наследник вызовом {@link __applyAutoFocus}. */
	readonly autoFocus: boolean;

	/** Ожидание появления контрола в документе — только пока автофокус отложен. */
	private __autoFocusWait?: WeakRef<ConnectedWaiter>;

	constructor(typeName: string, elem: HTMLElement, valueElem: FormInput<T>, overrides?: ValueElemOverrides) {
		super(typeName, elem);

		this.__valueElem = valueElem;
		this.__overrides = overrides;
		this.autoFocus = InputControl.isAutoFocus(valueElem);

		// то, что раньше делал _onRenderElement-override; теперь применяем после super, чтобы видеть valueElem
		elem.classList.add(INPUT_CSS_CLASS);
		if (this.required) elem.classList.add("required");
		if (this.readonly) elem.classList.add("readonly");
		if (this.disabled) elem.classList.add("disabled");

		this.__initForm();
	}

	/**
	 * Признан ли элемент полем только для чтения: нативный атрибут `readonly` либо `data-readonly` —
	 * последний нужен полям, у которых нативного атрибута нет (например, `select`).
	 *
	 * Статический, потому что контролам это нужно и до `super(...)` — режим влияет на сборку
	 * их разметки; после конструирования то же самое отдаёт getter {@link readonly}.
	 */
	protected static isReadonly(valueElem: HTMLElement): boolean {
		return valueElem.hasAttribute("readonly") || valueElem.hasAttribute("data-readonly");
	}

	/**
	 * Объявлен ли автофокус: нативный `autofocus` либо `data-autofocus` — второй нужен разметке,
	 * которой нативный атрибут не подходит по другим причинам (валидаторы, серверный рендер).
	 *
	 * Браузер разбирает нативный атрибут при разборе разметки, когда контрола ещё нет: поле,
	 * скрытое классом уже в разметке, он пропустит, а видимое — сфокусирует, но перенос поля
	 * в контейнер контрола этот фокус тут же собьёт (браузер снимает фокус с перемещаемого узла).
	 * Так что фокус в любом случае ставит контрол — см. {@link __applyAutoFocus}, — а атрибут
	 * остаётся объявлением намерения.
	 *
	 * Статический, потому что контролам это нужно и до `super(...)`; после конструирования
	 * то же самое отдаёт {@link autoFocus}.
	 */
	protected static isAutoFocus(valueElem: HTMLElement): boolean {
		return valueElem.hasAttribute("autofocus") || valueElem.hasAttribute("data-autofocus");
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
		return InputControl.isReadonly(this.__valueElem);
	}

	/**
	 * Довести значение до `__valueElem`, если контрол держит его отдельно и обновляет не мгновенно
	 * (например, редактор с отложенной сериализацией). Вызывается перед каждым чтением значения
	 * снаружи: валидация, отправка формы, сбор `FormData`. По умолчанию ничего не делает —
	 * у контролов, пишущих в поле сразу, синхронизировать нечего.
	 *
	 * Native constraint validation cannot be intercepted — it runs before the `submit` event.
	 * Submitting by button is unaffected: the click moves focus away first, and leaving the field
	 * brings the value over. What remains is submitting without losing focus — {@link __requestSubmit}
	 * covers the Enter case, while a host-driven `form.requestSubmit()` on a focused field must
	 * go through it as well.
	 */
	protected __syncValue(): void {}

	private __initForm() {
		// Логика валидации — штатная: ограничения объявлены на поле-носителе, решение принимает
		// браузер, он же блокирует отправку и поднимает invalid. Контрол только отражает это
		// классом и своё событие submit не досылает — обработчики формы получают ровно то же,
		// что и у обычных input/textarea.
		//
		// Гасим лишь показ подсказки: поле уведено с экрана, привязать её не к чему, и браузер
		// вместо неё пишет в консоль «not focusable». Состояние видно по классу invalid.
		this.__invalidEvent = (e: Event) => {
			e.preventDefault();

			this.element.classList.add("invalid");
		};
		this.__valueElem.addEventListener("invalid", this.__invalidEvent);

		// Значение переносим в поле формы до отправки. Проверять здесь нечего: контрол объявляет
		// свои ограничения через setCustomValidity, а решение принимает браузер — до submit он
		// уже отказал бы. Синхронизация нужна и при отключённой валидации, поэтому она первым делом.
		this.__submitEvent = () => this.__syncValue();

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

	/**
	 * Отправка формы по Enter — как у обычного `input`: браузер сам проверит валидность,
	 * поднимет отменяемый `submit` и отправит форму.
	 *
	 * Не то же, что {@link __submitForm}: тот лишь диспатчит событие, а синтетическое событие
	 * вызывает обработчиков, но саму отправку не запускает — форма с `action` никуда не уходила.
	 *
	 * Неявная отправка в браузере равносильна нажатию первой кнопки отправки, поэтому её же
	 * передаём инициатором: от неё зависят `formaction`, `formnovalidate` и `e.submitter`.
	 */
	protected __requestSubmit() {
		const form = this.form;
		if (this.readonly || this.disabled || !form) return;

		// Constraint validation runs before the submit event, so syncing in its handler is too
		// late — the browser would read the value element first. Losing focus normally brings the
		// value over, but submitting by Enter happens without it, and a required field would
		// refuse an empty value while the text is right there.
		this.__syncValue();

		if (typeof form.requestSubmit !== "function") {
			this.__submitForm(); // движок без requestSubmit — хотя бы уведомим обработчиков
			return;
		}

		const submitter = form.querySelector<HTMLButtonElement>(
			"button[type=submit], input[type=submit], button:not([type])"
		);

		form.requestSubmit(submitter ?? undefined);
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

	/**
	 * Фокус в контрол. Выключенное поле фокус не принимает — как нативный `disabled` input:
	 * раньше это выходило само собой (браузер игнорирует `focus()` на выключенном поле),
	 * но контрол на редакторе уводит фокус в свой элемент, а тот выключение не запрещает,
	 * — поэтому запрет объявлен здесь, рядом с таким же в {@link __requestSubmit}.
	 *
	 * Поле только для чтения фокусируется: это его нативное поведение — текст читают,
	 * выделяют и копируют, и уводить от него клавиатуру нельзя.
	 *
	 * `scroll` — насколько двигать вид: по умолчанию контрол выводится в середину экрана, потому
	 * что фокус из кода обычно ведут к тому, что нужно показать (ошибка формы, шаг мастера).
	 * Автофокус просит `"nearest"` — там страницу ещё не читали, и сдвигать её ради поля,
	 * которое и так на виду, не за чем.
	 */
	focus(scroll: ScrollLogicalPosition = "center"): void {
		if (this.disabled) return;

		this.__focusValue();
		this.element.scrollIntoView({ block: scroll, inline: scroll });
	}

	/**
	 * Куда именно ведёт фокус контрола. По умолчанию — поле-носитель; контролы, у которых
	 * ввод идёт в другом элементе, подменяют его здесь, а общие проверки и прокрутку
	 * оставляют базовому {@link focus}.
	 */
	protected __focusValue(): void {
		this.__valueElem.focus();
	}

	/**
	 * Ставит фокус в контрол, если поле объявило автофокус (см. {@link isAutoFocus}). Зовёт
	 * наследник в конце своего конструктора: базовый отработал раньше, чем собран ввод контрола
	 * (редактор привязывается уже после `super(...)`), и фокусировать там было бы нечего.
	 *
	 * Отказывает молча, потому что автофокус — пожелание разметки, а не команда:
	 * - выключенное поле фокус не принимает, а поле только для чтения нечего править;
	 * - вводят пальцем — экранная клавиатура закрыла бы страницу, которую ещё не читали;
	 * - пользователь уже прокрутил страницу сам — вид принадлежит ему;
	 * - фокус держит поле ввода или другой контрол — там уже работают.
	 *
	 * @returns Поставлен ли фокус сейчас; отложенный до появления в документе даёт `false`.
	 */
	protected __applyAutoFocus(): boolean {
		if (!this.autoFocus) return false;

		// Контрол собирают и вне документа: страница рендерится во фрагмент и попадает на экран
		// уже собранной. В неподключённый элемент браузер фокус не ставит, а прокручивать нечего,
		// поэтому ждём появления в документе — и там же перепроверяем условия заново: за время
		// ожидания пользователь мог и прокрутить страницу, и встать в другое поле.
		if (!this.element.isConnected) {
			this.__waitConnected();
			return false;
		}

		this.__stopWaitConnected();

		if (this.disabled || this.readonly || isCoarsePointer() || hasUserScrolled()) return false;

		// Чужой фокус не отбираем: его держит либо поле ввода — там уже печатают, — либо контрол
		// ввода, инициализированный раньше (двух автофокусов на странице не бывает). Кнопка или
		// ссылка, которой пришли на страницу, автофокусу не помеха: фокус на ней остался от клика,
		// а не ради ввода. Фокус внутри самого контрола — тем более.
		const active = this.__valueElem.ownerDocument.activeElement;
		if (active && !this.element.contains(active) && (isTextEntry(active) || active.closest(`.${INPUT_CSS_CLASS}`)))
			return false;

		this.focus("nearest");

		return true;
	}

	/** Ждёт появления контрола в документе, чтобы поставить отложенный автофокус. */
	private __waitConnected() {
		if (this.__autoFocusWait) return;

		// приведение — ради приватного метода: реестру ожиданий нужен только он
		this.__autoFocusWait = new WeakRef(this as unknown as ConnectedWaiter);
		waitConnected(this.__valueElem.ownerDocument, this.__autoFocusWait);
	}

	/**
	 * Контрол появился в документе — ставим отложенный автофокус. Не приватный только потому,
	 * что зовут его снаружи класса — из реестра ожиданий этого модуля.
	 */
	protected __onConnected(): boolean {
		if (!this.element.isConnected) return false;

		this.__applyAutoFocus(); // подключённый контрол сам снимет ожидание

		return true;
	}

	private __stopWaitConnected() {
		if (!this.__autoFocusWait) return;

		stopWaitConnected(this.__valueElem.ownerDocument, this.__autoFocusWait);
		this.__autoFocusWait = undefined;
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
		this.__stopWaitConnected();

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
	get autoFocus(): boolean;

	validate(): boolean;
	focus(scroll?: ScrollLogicalPosition): void;
	destroy(): void;
}
