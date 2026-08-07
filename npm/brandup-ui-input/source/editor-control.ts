import { InputControl, type ValueElemOverrides } from "./input";

/** Поле формы, которое контрол на редакторе оставляет носителем значения. */
type EditorValueElem = HTMLInputElement | HTMLTextAreaElement;

/**
 * Редактор, которому контрол доверяет ввод значения. Структурный интерфейс, а не тип из
 * `@brandup/ui-richeditor`: этот пакет — общая база всех контролов ввода, и потребители без
 * редактора (например, dropdown) не должны тянуть его за собой. `RichEditor` подходит под
 * интерфейс как есть; членов здесь ровно столько, сколько зовёт общая механика базового класса.
 */
export interface ValueEditor {
	/** Редактируемый элемент — он принимает фокус вместо уведённого с экрана поля-носителя. */
	readonly editable: HTMLElement;
	/** Заменяет содержимое редактора; редактор нормализует значение и поднимает своё изменение. */
	setValue(value: string): void;
	/** Доставляет отложенное изменение немедленно — перед чтением значения извне. */
	flushChange(): void;
	/** Фокус в редактор; `atEnd` — ставить ли каретку в конец текста, если её ещё не было. */
	focus(atEnd?: boolean): void;
	destroy(): void;
}

/** Что базовому классу нужно знать о конкретном контроле. */
export interface EditorControlInit {
	/** Имя события изменения контрола — на него подписывает {@link EditorInputControl.onChange}. */
	changeEvent: string;
	/** Ставить ли при {@link EditorInputControl.focus} каретку в конец текста, если её ещё не было. */
	focusAtEnd?: boolean;
}

/**
 * Контрол ввода, где значением управляет редактор в соседнем редактируемом элементе, а исходное
 * поле остаётся носителем значения и участвует в форме. Общая механика таких контролов
 * (textbox, messageeditor): синхронизация отложенного изменения редактора с полем, зеркало
 * фокуса, гашение нативного change скрытого поля, обёртка поля контейнером и снятие всего
 * этого при destroy. Всё доменное — фильтры ввода, подсветка, кнопки — остаётся в наследниках.
 *
 * Редактор создаёт наследник: опции редактора замыкаются на `this` и собираются только после
 * `super(...)`. Сразу после создания наследник обязан передать редактор в {@link __attachEditor}.
 */
export abstract class EditorInputControl<TEditor extends ValueEditor, TChangeData, TEvents = {}> extends InputControl<
	EditorValueElem,
	TEvents
> {
	/**
	 * Редактор контрола; назначается в {@link __attachEditor} сразу после `super(...)`.
	 *
	 * До этого момента его нет, и промежуток не пустой: базовый конструктор уже привязал
	 * элемент, повесил слушатели формы и включил авторазрушение по удалению из DOM. Если
	 * конструктор наследника упадёт после `super(...)`, эти слушатели останутся жить на
	 * недостроенном контроле — поэтому каждый метод базы, трогающий редактор, обязан
	 * терпеть его отсутствие. Наружу тип объявлен непустым: наследники работают с редактором
	 * уже после привязки, и разбирать `undefined` в каждом их обращении было бы шумом.
	 */
	protected __editor!: TEditor;
	/** Слушатели контрола снимаются одним сигналом — он же гасит и таймеры наследников. */
	protected __listenerAbort = new AbortController();
	private __init: EditorControlInit;

	constructor(
		typeName: string,
		elem: HTMLElement,
		valueElem: EditorValueElem,
		overrides: ValueElemOverrides | undefined,
		init: EditorControlInit
	) {
		super(typeName, elem, valueElem, overrides);

		this.__init = init;

		// гасим нативный change скрытого поля
		this.__valueElem.addEventListener(
			"change",
			(e: Event) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			},
			{ signal: this.__listenerAbort.signal }
		);
	}

	/**
	 * Скрывает поле-носитель и оборачивает его контейнером контрола: {@link prepareValueElem}
	 * плюс подмена tabindex — в фокус попадает редактируемый элемент, а не уведённое с экрана
	 * поле. Статический, потому что вызывается до `super(...)`; подменённый tabindex наследник
	 * возвращает через {@link ValueElemOverrides}.
	 */
	protected static wrapValueElem(
		valueElem: EditorValueElem,
		container: HTMLElement,
		inputClass: string,
		editable: HTMLElement,
		disabled: boolean
	) {
		InputControl.prepareValueElem(valueElem, container, inputClass);

		editable.tabIndex = disabled ? -1 : valueElem.tabIndex;
		valueElem.tabIndex = -1;

		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);
	}

	/**
	 * Принимает созданный наследником редактор: с этого момента им владеет базовый класс —
	 * он его синхронизирует, фокусирует и разрушает. Заодно зеркалит фокус редактируемого
	 * элемента классом на корневом элементе контрола — состояние поля показывает весь контрол.
	 */
	protected __attachEditor(editor: TEditor): void {
		this.__editor = editor;

		const { signal } = this.__listenerAbort;
		const editable = editor.editable;

		// состояние фокуса контрола — на корневом элементе
		editable.addEventListener("focus", () => !this.disabled && this.element.classList.add("focused"), { signal });
		editable.addEventListener("blur", () => !this.disabled && this.element.classList.remove("focused"), { signal });

		// form.reset() возвращает поле-носитель к defaultValue, а редактор об этом сам не узнал бы —
		// следующая синхронизация перезаписала бы сброс обратно. Сброс применяется после события,
		// поэтому выравниваем редактор отложенно и только если сброс не отменили; разрушенный
		// к этому моменту контрол трогать нечего — его выдаёт снятый сигнал.
		this.form?.addEventListener(
			"reset",
			(e) => {
				window.setTimeout(() => {
					if (!signal.aborted && !e.defaultPrevented) this.__editor?.setValue(this.__valueElem.defaultValue);
				});
			},
			{ signal }
		);
	}

	// Редактор откладывает событие изменения при печати, поэтому копия значения в поле формы
	// отстаёт. Базовый класс зовёт этот хук перед каждым чтением значения снаружи —
	// валидация, отправка формы, сбор FormData.
	protected override __syncValue(): void {
		if (!this.__editor) return; // редактора ещё (или уже) нет — синхронизировать нечего

		this.__editor.flushChange();
		this.__refreshValidity();
	}

	/**
	 * Освежает собственное ограничение контрола на поле-носителе (setCustomValidity) — зовётся
	 * при каждой синхронизации значения. По умолчанию собственных ограничений нет.
	 */
	protected __refreshValidity(): void {}

	onChange(handler: (e: TChangeData) => void) {
		// имя события у каждого контрола своё — типизацию даёт TEvents наследника
		this.on(this.__init.changeEvent as keyof TEvents & string, handler as never);
	}

	hasValue(): boolean {
		return !!this.getValue();
	}

	getValue(): string {
		this.__syncValue(); // значение читают снаружи — отложенное изменение сюда обязано попасть
		return this.__valueElem.value.trim();
	}

	setValue(value: string): void {
		// редактор нормализует значение и поднимет своё изменение — оно и синхронизирует
		// поле-носитель, и вызовет событие изменения контрола
		this.__editor?.setValue(value?.trim() ?? "");
	}

	/**
	 * Поле-носитель уведено с экрана (visibility: collapse) и в браузере фокус не принимает —
	 * ведём фокус в редактор. Проверки состояния и прокрутку к контролу делает базовый
	 * {@link InputControl.focus}.
	 */
	protected override __focusValue(): void {
		this.__editor?.focus(this.__init.focusAtEnd);
	}

	override destroy(): void {
		this.__listenerAbort.abort();
		this.__editor?.destroy();

		super.destroy(); // снимет слушатели формы и вернёт поле-носитель в исходный вид
	}
}
