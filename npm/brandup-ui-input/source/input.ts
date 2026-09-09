import { UIElementBound } from "@brandup/ui";
import { INPUT } from "./names";
// Из кита берём ровно два признака и берём их отдельным входом: его общий вход тянет за собой
// попап, модальное окно, стили и @brandup/ui-app — базе ввода это не нужно, а сборке пакета мешает.
import { hasUserScrolled, isCoarsePointer } from "@brandup/ui-kit/env";
// Тем же узким входом, что и env: позиционирование ничего не импортирует, поэтому попап,
// модальное окно и @brandup/ui-app за ним не приезжают.
import { trackPosition } from "@brandup/ui-kit/position";
import "./input.less";

type InputType = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FormInput<T> = T extends InputType ? T : never;

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

/**
 * Счётчик для идентификаторов элементов с сообщением об ошибке: связать текст с полем можно
 * только через `aria-describedby`, а тот ссылается по id. Свой ставим лишь тому элементу,
 * у которого его нет, — id в разметке хоста трогать нельзя, на него ссылаются и другие.
 */
let errorIdCounter = 0;

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

	/** Пузырь с текстом ошибки, созданный базой. Место хоста сюда не попадает: оно не наше. */
	private __errorBubble?: HTMLElement;
	/** Снятие слежения за положением пузыря; есть, только пока пузырь показан. */
	private __untrackError?: () => void;
	/** Показано ли сейчас сообщение — чтобы не искать место под текст, которого нет. */
	private __errorShown?: boolean;

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
		elem.classList.add(INPUT.CLASS.ROOT);
		if (this.required) elem.classList.add(INPUT.CLASS.STATE.REQUIRED);
		if (this.readonly) elem.classList.add(INPUT.CLASS.STATE.READONLY);
		if (this.disabled) elem.classList.add(INPUT.CLASS.STATE.DISABLED);

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
		// Гасим лишь показ нативной подсказки: поле уведено с экрана, привязать её не к чему,
		// и браузер вместо неё пишет в консоль «not focusable». Текст при этом не теряется —
		// он остаётся в `validationMessage`, и показываем его мы сами, у видимого контрола.
		this.__invalidEvent = (e: Event) => {
			e.preventDefault();

			this.__setValid(false);
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

		this.__setValid(result);

		return result;
	}

	/**
	 * Отражает вердикт проверки: класс состояния, `aria-invalid` и сообщение.
	 *
	 * Одно место на всё. Раньше класс ставила база, а снимали наследники — textbox, dropdown
	 * и messageeditor, каждый по-своему, шесть мест на три пакета, — и вид расходился
	 * с состоянием: у одного класс снимался на любой правке, у другого только после повторной
	 * проверки. С появлением текста расхождение стало бы видимым: рамка есть, текста нет.
	 *
	 * Текст берём из `validationMessage` поля-носителя: он уже локализован браузером, а свои
	 * формулировки контролы кладут туда через `setCustomValidity`.
	 */
	protected __setValid(isValid: boolean): void {
		this.element.classList.toggle(INPUT.CLASS.STATE.INVALID, !isValid);

		if (isValid) this.__focusElem.removeAttribute("aria-invalid");
		else this.__focusElem.setAttribute("aria-invalid", "true");

		this.__renderError(isValid ? "" : this.__valueElem.validationMessage);
	}

	/**
	 * Показывает сообщение или убирает его, если строка пуста.
	 *
	 * Текст пишется туда, где хост отвёл ему место, и больше никуда: раскладка страницы
	 * принадлежит хосту, и кит не заводит в ней узлов по своему усмотрению. Постоянная строка
	 * под полем и лучше всплывающей — она не исчезает при прокрутке, а на форме видно сразу все
	 * отказы, а не тот, до которого дошла очередь.
	 *
	 * Пузырь у контрола — на случай, когда места нет и взять его негде: просят явно, режимом
	 * `popup`. Сам собой он не появляется, иначе кит менял бы чужую разметку молча.
	 */
	private __renderError(message: string): void {
		// Годный контрол проверяют часто — textbox перепроверяет себя на каждую правку, — и пока
		// показывать нечего и не показывали, искать место незачем.
		if (!message && !this.__errorShown) return;
		this.__errorShown = !!message;

		const mode = this.element.getAttribute(INPUT.ATTR.ERROR_DISPLAY);
		if (mode === "none") return;

		const slot = this.__findErrorSlot();
		// Пузырь заводим только в его режиме и только под текст: у контрола, ни разу не отказавшего,
		// лишнего узла в разметке не появляется. Пустое сообщение попадает в уже созданный —
		// иначе его нечем было бы убрать.
		const target = slot ?? (mode === "popup" ? (message ? this.__ensureErrorBubble() : this.__errorBubble) : null);
		if (!target) return;

		target.textContent = message;
		target.hidden = !message;

		if (message) {
			this.__announceable(target);
			this.__describedBy(target, true);
			if (target === this.__errorBubble) this.__trackErrorBubble(target);
		} else {
			this.__describedBy(target, false);
			this.__stopTrackingError();
		}
	}

	/**
	 * Место, которое хост отвёл под сообщение: элемент с атрибутом внутри контрола либо, если
	 * значение атрибута стоит на самом контроле, элемент с таким id где угодно в документе —
	 * так текст кладут в сводку под формой или в соседнюю колонку таблицы.
	 */
	private __findErrorSlot(): HTMLElement | null {
		const inside = this.element.querySelector<HTMLElement>(`[${INPUT.ATTR.ERROR}]`);
		// Внутри контрола может стоять другой контрол со своим местом под сообщение — чужое
		// не занимаем: ближайший контрол-предок найденного места должен быть этим самым.
		if (inside && inside.closest(`.${INPUT.CLASS.ROOT}`) === this.element) return inside;

		const id = this.element.getAttribute(INPUT.ATTR.ERROR);
		return id ? this.__valueElem.ownerDocument.getElementById(id) : null;
	}

	/**
	 * Просит читалку зачитывать появившийся текст, если хост не распорядился иначе.
	 *
	 * Связи через `aria-describedby` мало: она срабатывает, когда в поле входят, а отказ на
	 * отправке приходит, когда фокус где угодно. Своё объявление хоста — `role` или `aria-live` —
	 * не трогаем: он мог выбрать и резкость, и молчание намеренно.
	 */
	private __announceable(slot: HTMLElement): HTMLElement {
		if (!slot.hasAttribute("role") && !slot.hasAttribute("aria-live")) slot.setAttribute("aria-live", "polite");

		return slot;
	}

	/** Заводит собственный пузырь — один раз на контрол, дальше он переиспользуется. */
	private __ensureErrorBubble(): HTMLElement {
		if (this.__errorBubble) return this.__errorBubble;

		const bubble = this.__valueElem.ownerDocument.createElement("div");
		bubble.className = INPUT.CLASS.ERROR;
		// Пузырь появляется и исчезает мимо фокуса — по отказу на отправке. Вежливая срочность,
		// а не `alert`: он же связан с полем через `aria-describedby`, и на «резкой» читалка
		// объявила бы текст дважды.
		bubble.setAttribute("aria-live", "polite");

		// Внутрь контрола, а не в body: контрол при разрушении и так уносит своё поддерево,
		// а позиционирование само разбирается с предком, создающим fixed-контекст.
		this.element.appendChild(bubble);

		return (this.__errorBubble = bubble);
	}

	/**
	 * Держит пузырь у контрола, пока текст показан: страницу прокручивают и разворачивают.
	 *
	 * Повторную просьбу пропускаем: пока сообщение висит, контрол перепроверяют на каждую правку,
	 * а слежение каждый раз пересобирало бы слушатели прокрутки у всех прокручиваемых предков.
	 */
	private __trackErrorBubble(bubble: HTMLElement): void {
		if (this.__untrackError) return;

		this.__untrackError = trackPosition(bubble, this.element, { placement: "bottom-start", gap: 4 });
	}

	private __stopTrackingError(): void {
		this.__untrackError?.();
		this.__untrackError = undefined;
	}

	/**
	 * Связывает сообщение с полем или отвязывает его.
	 *
	 * Свой идентификатор дописываем к тем, что уже перечислены, а не заменяем список: у поля
	 * бывает и подпись, и подсказка, и потерять их значит оставить читалку без половины сведений
	 * о поле. Снятие тоже точечное — убираем только свой.
	 */
	private __describedBy(target: HTMLElement, linked: boolean): void {
		if (linked && !target.id) target.id = `ui-input-error-${++errorIdCounter}`;
		if (!target.id) return; // отвязывать нечего: идентификатора не было, значит и ссылки нет

		const current = this.__focusElem.getAttribute("aria-describedby");
		const tokens = (current ? current.split(/\s+/) : []).filter((token) => token && token !== target.id);

		if (linked) tokens.push(target.id);

		if (tokens.length) this.__focusElem.setAttribute("aria-describedby", tokens.join(" "));
		else this.__focusElem.removeAttribute("aria-describedby");
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
		this.__focusElem.focus();
	}

	/**
	 * Элемент, с которым работает пользователь: он принимает фокус и несёт признаки состояния
	 * для читалки — `aria-invalid` и ссылку на текст ошибки. По умолчанию поле-носитель;
	 * контролы, у которых ввод идёт в другом элементе, подменяют его здесь.
	 *
	 * Ставить эти признаки на поле-носитель вслепую нельзя: оно уведено с экрана
	 * (`visibility: collapse`), и читалка его не видит — сообщение о неверном значении
	 * не дошло бы ни до кого.
	 */
	protected get __focusElem(): HTMLElement {
		return this.__valueElem;
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
		if (active && !this.element.contains(active) && (isTextEntry(active) || active.closest(`.${INPUT.CLASS.ROOT}`)))
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

		// Признаки отказа снимаем до возврата поля: оно остаётся в форме и живёт дальше, а
		// `aria-invalid` и ссылка на сообщение, исчезающее вместе с контролом, читалке только
		// врут. Учёт подменённых атрибутов (`__overrides`) их не покрывает — их ставит база,
		// а не контрол при сборке.
		this.__setValid(true);
		this.__stopTrackingError();

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
