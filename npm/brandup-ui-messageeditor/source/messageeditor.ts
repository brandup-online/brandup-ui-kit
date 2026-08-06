import "./messageeditor.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { POPUP_CLASS, SCROLLABLE_CLASS, type Modal } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui";
import RichEditor, {
	ALL_FORMAT_TOOLS,
	TOOLBAR_CLASS,
	parseBlockTypes,
	preserveCaret,
	type BlockType,
	type ToolbarButton,
} from "@brandup/ui-richeditor";
import { highlight, markupAt, MARKUP_SELECTOR, VARIABLE_CLASS, type VariableNames } from "./highlight";
import RandomizerModal from "./randomizer";
import VariablesModal, { parseVariables, type MessageVariable } from "./variables";
import emojiIcon from "../svg/emoji.svg";
import randomIcon from "../svg/random.svg";
import variableIcon from "../svg/variable.svg";

export const ROOT_CLASS = "ui-messageeditor";
export const INPUT_CLASS = "messageeditor-input";
export const EMOJI_CLASS = "messageeditor-emoji";
export const EMOJI_HOLDER_CLASS = "messageeditor-emoji-holder";
export const CHANGE_EVENT = "messageeditor-change";

export interface MessageEditorOptions {
	/**
	 * Переменные персонализации для кнопки в панели; пусто — список в окне будет пустым.
	 *
	 * Без них список берётся из атрибута `data-variables` поля-носителя (см. {@link parseVariables}) —
	 * для разметки, отданной сервером. Переданный список имеет приоритет: значит, приложение
	 * знает набор точнее.
	 */
	variables?: MessageVariable[];
	/**
	 * Включает персонализацию: кнопку в панели, подсветку переменных и правку их окном.
	 * По умолчанию выключена — без неё `{ИМЯ}` остаётся обычным текстом.
	 *
	 * Без этой опции берётся из разметки: атрибут `data-personalization` поля-носителя либо
	 * объявленный там же список переменных — объявили, значит нужна.
	 */
	personalization?: boolean;
	/**
	 * Текст в окне персонализации, когда список пуст; по умолчанию — «Переменные не заданы.».
	 * Без него берётся из атрибута `data-variables-empty` поля-носителя.
	 *
	 * Причину пустого списка знает приложение: переменные могут появиться после выбора аудитории,
	 * а могут быть не предусмотрены вовсе — и подсказка в этих случаях нужна разная.
	 */
	variablesEmpty?: string | null;
	/**
	 * Типы блоков сообщения: цитата, блок кода. По умолчанию только обычный текст —
	 * их понимает не каждый канал, поэтому набор объявляет приложение.
	 *
	 * Без этой опции берётся из атрибута `data-blocks` поля-носителя (значения через пробел).
	 */
	blocks?: BlockType[];
	/**
	 * Держать ли фокус в поле, пока открыта панель смайликов. По умолчанию держим, а на
	 * сенсорном устройстве нет: там фокус поднимает экранную клавиатуру, а она закрывает собой
	 * саму панель. Окна персонализации и рандомизации фокус забирают всегда.
	 */
	keepFocus?: boolean;
}

type MessageEditorEvents = {
	[CHANGE_EVENT]: (data: ChangeEventData) => void;
};

/**
 * Поле ввода сообщения: плашка чата поверх обычного поля формы.
 *
 * Устроен так же, как `@brandup/ui-textbox` — исходный `input`/`textarea` остаётся носителем
 * значения и участвует в форме, а ввод ведёт `RichEditor` в соседнем редактируемом элементе.
 *
 * Набор возможностей фиксирован под сообщение мессенджера и не настраивается: многострочность
 * (сообщение — это абзацы), форматирование с панелью и вставкой смайлика, значение в разметке
 * мессенджеров вместо HTML.
 */
export default class MessageEditor extends InputControl<HTMLInputElement | HTMLTextAreaElement, MessageEditorEvents> {
	private __editor: RichEditor;
	private __inputElem: HTMLElement; // редактируемый элемент (им владеет RichEditor)
	private __listenerAbort = new AbortController();
	private __composing = false; // идёт IME-ввод — подсветку откладываем
	private __names: VariableNames; // названия переменных по ключу — для подсветки
	private __modal: Modal | null = null; // открытое окно правки — его закрывает и destroy
	private __disposing = false; // компонент снимают: возвращать каретку и фокус уже некуда

	readonly placeholder: string | null;
	readonly variables: MessageVariable[];
	readonly variablesEmpty: string | null;
	readonly personalization: boolean;
	readonly blocks: BlockType[];

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement, options: MessageEditorOptions = {}) {
		const placeholder = valueElem.getAttribute("placeholder");
		const tabIndexAttr = valueElem.getAttribute("tabindex");
		const disabled = valueElem.disabled;
		const readonly = valueElem.hasAttribute("readonly") || valueElem.hasAttribute("data-readonly");

		// текст сообщения прокручивается сам — полоса оформляется общим классом кита
		const inputElem = DOM.tag("div", { class: SCROLLABLE_CLASS });
		// кнопка смайлика — часть компонента, а не тулбара: она нужна рядом с плашкой и доступна
		// сразу, не дожидаясь фокуса (тулбар появляется только по нему)
		const emojiElem = disabled
			? null
			: DOM.tag("button", { type: "button", class: EMOJI_CLASS, title: "Вставить смайлик" }, emojiIcon);

		// Собственная коробка кнопки: панель смайликов раскрывается от неё, а для этого нужен
		// позиционированный предок ровно по кнопке. От корня компонента панель вставала бы над
		// всем редактором, а не над кнопкой.
		const emojiHolder = emojiElem ? DOM.tag("div", { class: EMOJI_HOLDER_CLASS }, emojiElem) : null;

		const container = DOM.tag("div", { class: ROOT_CLASS }, [
			DOM.tag("div", { class: "bubble" }, [inputElem, emojiHolder]),
		]);

		MessageEditor.prepareValueElem(valueElem, container, INPUT_CLASS);

		// в фокус попадает редактируемый элемент, а не скрытый носитель значения
		inputElem.tabIndex = disabled ? -1 : valueElem.tabIndex;
		valueElem.tabIndex = -1;

		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		// класс и подменённый tabindex вернёт базовый класс при destroy
		super("BrandUp.MessageEditor", container, valueElem, {
			class: INPUT_CLASS,
			attrs: [["tabindex", tabIndexAttr]],
		});

		this.placeholder = placeholder;
		this.variables = options.variables ?? parseVariables(valueElem.dataset.variables);
		this.variablesEmpty = options.variablesEmpty ?? valueElem.dataset.variablesEmpty ?? null;
		// Объявленный список — тоже согласие: иначе переданные переменные молча никуда не вели бы.
		this.personalization =
			options.personalization ??
			("personalization" in valueElem.dataset || !!this.variables.length || !!this.variablesEmpty);
		this.blocks = options.blocks ?? parseBlockTypes(valueElem.dataset.blocks ?? null);
		// в тексте показываем название, а не ключ — если оно задано
		this.__names = new Map(this.variables.filter((v) => v.name).map((v) => [v.key, v.name!]));
		this.__inputElem = inputElem;

		this.__editor = new RichEditor(inputElem, {
			placeholder,
			multiline: true,
			// Enter переносит строку, а не создаёт абзац: иначе каждое нажатие уходило бы
			// в значение пустой строкой. Абзац набирается двумя переносами, как в мессенджерах.
			paragraph: "break",
			// цитата и блок кода — объявленным набором: их понимает не каждый канал
			blocks: this.blocks,
			keepFocus: options.keepFocus,
			// disabled для редактора — тот же запрет правок, что и readonly (сам он про disabled не знает)
			readonly: readonly || disabled,
			// набор мессенджера: жирный, курсив, зачёркнутый, подчёркнутый. Смайлики в тулбар
			// не выводим — для них своя кнопка рядом с плашкой. В disabled форматирование
			// выключено целиком: без инструментов панель не строится и не показывается.
			format: !disabled,
			tools: ALL_FORMAT_TOOLS,
			// Очистка формата: снять разметку разом нужнее всего там, где текст приносят
			// вставкой. Отмену и повтор не выводим — на них есть привычные сочетания клавиш.
			actions: ["erase"],
			// доменные кнопки: редактор про рандомизацию и переменные не знает, только рисует их
			buttons: disabled ? [] : this.__toolbarButtons(),
			// значение хранится разметкой мессенджеров, а не HTML
			storage: "markdown",
			// панель показывается над плашкой, а не над document.body
			toolbarContainer: container,
			value: valueElem.value,
			// onEnter здесь не нужен: он про однострочный режим, а сообщение всегда многострочное —
			// Enter переносит строку и форму не отправляет
		});

		// RichEditor про disabled не знает — запрещаем правку на своей стороне
		// (визуал даёт класс .disabled от InputControl)
		if (disabled) inputElem.contentEditable = "false";

		// приводим носитель значения к нормализованному содержимому редактора (без события)
		this.__valueElem.value = this.__editor.getValue();

		this.__initLogic();
		if (emojiElem && emojiHolder) this.__initEmoji(emojiElem, emojiHolder);

		this.__highlight(); // начальное значение события change не поднимает
	}

	private __initLogic() {
		const { signal } = this.__listenerAbort;
		const editable = this.__inputElem;

		this.__editor.onChange((data) => {
			this.__valueElem.value = data.value;

			this.__highlight();

			if (this.element.classList.contains("invalid") && this.validate()) this.element.classList.remove("invalid");

			this.trigger(CHANGE_EVENT, <ChangeEventData>{ editor: this, value: this.getValue() });
		});

		// Подсветка — на каждый ввод, а не только по change: событие изменения при печати
		// троттлится, а конструкция должна подсвечиваться сразу, как дописана закрывающая скобка.
		// Сама highlight() дёшево выходит, когда ни конструкций, ни прежних обёрток нет.
		editable.addEventListener("input", () => this.__highlight(), { signal });

		// состояние фокуса — на корневом элементе, плашка подсвечивается целиком
		editable.addEventListener("focus", () => !this.disabled && this.element.classList.add("focused"), { signal });
		editable.addEventListener("blur", () => !this.disabled && this.element.classList.remove("focused"), { signal });

		// Клик мимо текста — тоже клик по полю: плашка выглядит и ведёт себя как одно поле ввода,
		// а её поля и место справа от текста в редактируемый элемент не входят.
		this.element.addEventListener("mousedown", (e) => this.__focusFromBubble(e), { signal });

		// правка конструкций — только через своё окно: в тексте они атомарны
		editable.addEventListener(
			"click",
			(e) => {
				if (this.disabled || this.readonly) return;

				const span = (e.target as HTMLElement).closest?.<HTMLElement>(MARKUP_SELECTOR);
				if (span) this.__editMarkup(span);
			},
			{ signal }
		);

		editable.addEventListener("compositionstart", () => (this.__composing = true), { signal });
		editable.addEventListener(
			"compositionend",
			() => {
				this.__composing = false;
				this.__highlight();
			},
			{ signal }
		);

		// гасим нативный change скрытого поля
		this.__valueElem.addEventListener(
			"change",
			(e: Event) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			},
			{ signal }
		);
	}

	// Редактор откладывает событие изменения при печати, поэтому копия значения в поле формы
	// отстаёт. Базовый класс зовёт этот хук перед каждым чтением значения снаружи —
	// валидация, отправка формы, сбор FormData.
	protected override __syncValue(): void {
		this.__editor.flushChange();
	}

	/**
	 * Фокус по клику в плашку мимо текста: её поля и место справа от последней строки в
	 * редактируемый элемент не входят, а выглядит она одним полем ввода.
	 *
	 * Гасим нажатие: браузер иначе снимет выделение и уведёт фокус на корневой элемент, где
	 * каретке места нет. Каретку возвращаем на прежнее место, а если её ещё не было — в конец
	 * текста: клик мимо текста это клик за ним.
	 */
	private __focusFromBubble(e: MouseEvent) {
		if (this.disabled) return;

		const target = e.target as HTMLElement | null;
		if (!target || this.__inputElem.contains(target)) return; // в сам текст браузер попадёт и сам

		// своя кнопка, панель форматирования и её попапы живут внутри плашки и работают сами
		if (target.closest(`button, a, input, textarea, select, .${TOOLBAR_CLASS}, .${POPUP_CLASS}`)) return;

		e.preventDefault();
		this.__editor.focus(true);
	}

	/**
	 * Подсветка спинтакса и переменных. Текст от неё не меняется, поэтому каретка
	 * восстанавливается по смещениям точно; возвращаем её всякий раз, когда разметку
	 * перестраивали, — обёртки собираются заново, и старое выделение указывало бы в никуда.
	 *
	 * Во время IME-композиции не вмешиваемся: перестановка каретки прервала бы набор.
	 */
	private __highlight() {
		if (this.__composing) return;

		preserveCaret(this.__inputElem, () =>
			highlight(this.__inputElem, { names: this.__names, variables: this.personalization })
		);

		this.__escapeMarkup();
	}

	/**
	 * Выносит каретку из конструкции наружу.
	 *
	 * Смещения внутри конструкции и на её краю неразличимы: и то и другое указывает на текст
	 * внутри обёртки, поэтому восстановленная по смещению каретка встаёт внутри. А обёртка
	 * не редактируется (`contenteditable="false"`) — каретку там браузер не рисует и не держит:
	 * снимает выделение и уводит фокус из поля, печатать становится некуда.
	 *
	 * Случается это всякий раз, когда каретка возвращается по смещениям: после вставки из окна,
	 * после его закрытия и когда закрывающая скобка дописана руками — конструкция тогда
	 * собирается прямо под кареткой.
	 */
	private __escapeMarkup() {
		const selection = this.__editor.selection;
		if (!selection?.isCollapsed) return;

		const node = selection.anchorNode;
		const span = markupAt(node);
		if (!span) return;

		// С какого края вышли, туда и ставим: иначе каретка перед конструкцией перепрыгнула бы её.
		// Первый текст ищем в глубину: у переменной с названием ключ лежит в своей обёртке,
		// и firstChild — это она, а не текстовый узел.
		let first: Node = span;
		while (first.firstChild) first = first.firstChild;

		const atStart = selection.anchorOffset === 0 && (node === span || node === first);
		const neighbour = atStart ? span.previousSibling : span.nextSibling;

		const range = this.__inputElem.ownerDocument.createRange();

		// в соседний текст, если он есть: позицию рядом с невредактируемым элементом браузер
		// рисует неохотно, а внутри текстового узла каретка видна всегда
		if (neighbour?.nodeType === Node.TEXT_NODE)
			range.setStart(neighbour, atStart ? (neighbour.textContent?.length ?? 0) : 0);
		else if (atStart) range.setStartBefore(span);
		else range.setStartAfter(span);

		range.collapse(true);

		selection.removeAllRanges();
		selection.addRange(range);
	}

	/** Открывает окно правки конструкции; результат заменяет её целиком. */
	private __editMarkup(span: HTMLElement) {
		const variable = span.classList.contains(VARIABLE_CLASS);
		// без персонализации переменные и не подсвечиваются, но проверка дешевле, чем догадка
		if (variable && !this.personalization) return;

		this.__openModal(
			variable
				? (apply) => new VariablesModal(this.variables, apply, this.variablesEmpty)
				: (apply) => new RandomizerModal(span.textContent ?? "", apply),
			span
		);
	}

	/**
	 * Открывает окно правки и возвращает правку в поле, чем бы окно ни кончилось.
	 *
	 * Редактор на это время придержан: фокус уходит в окно, но ввод не закончен. Без удержания
	 * blur сошёл бы за конец правки — содержимое привелось бы к нормальному виду, срезав пробел
	 * на границе каретки и сдвинув её саму, и результат встал бы не туда.
	 *
	 * Место правки запоминается до открытия: окно забирает не только фокус, но и выделение
	 * документа — у рандомизации есть свои поля ввода, и каретка встанет уже в них.
	 *
	 * @param replace Конструкция, которую заменяет результат; без неё результат вставляется в каретку.
	 */
	private __openModal(create: (apply: (text: string) => void) => Modal, replace?: HTMLElement) {
		const caret = this.__editor.caretSnapshot();
		const release = this.__editor.holdEditing();
		// Фокус полю на время окна не нужен: правка идёт в нём. На сенсорном устройстве он к тому
		// же держит на экране клавиатуру, а она закрывает собой само окно. Каретка снята выше,
		// и по закрытию окна фокус вернётся вместе с ней.
		this.__editor.releaseFocus();
		let applied = false;

		const apply = (text: string) => {
			applied = true;

			if (caret) this.__editor.restoreCaret(caret);
			else this.__editor.focus();

			// выделяем правленую конструкцию целиком — insertText заменит выделенное
			if (replace) this.__editor.selectNode(replace);

			// вставка сама ставит каретку сразу за вставленным
			this.__editor.insertText(text);
		};

		let modal: Modal;
		try {
			modal = create(apply);
		} catch (error) {
			// иначе редактор остался бы придержанным навсегда и перестал приводить содержимое в порядок
			release();
			throw error;
		}

		// Окно живёт в body и снятие компонента переживёт: держим его, чтобы закрыть самим.
		this.__modal = modal;

		modal.onClosed(() => {
			if (this.__modal === modal) this.__modal = null;

			// окно закрыли, ничего не выбрав, — возвращаем правку туда, где её прервали.
			// Окно правки открывают кликом по самой конструкции, и каретка внутри неё не рисуется.
			// Если компонент снимают, возвращать её некуда — поля сейчас не станет.
			if (!this.__disposing && !applied && caret) {
				this.__editor.restoreCaret(caret);
				this.__escapeMarkup();
			}

			// снимаем удержание последним: фокус уже в поле, и содержимое трогать рано
			release();
		});
	}

	/** Стоит ли выделение внутри готовой конструкции — вкладывать их друг в друга нельзя. */
	private __inMarkup(): boolean {
		return !!markupAt(this.__editor.selection?.anchorNode);
	}

	/**
	 * Кнопки панели, которых нет в редакторе. Обе открывают модальное окно и вставляют
	 * результат в каретку; выделение к этому моменту сохранено — панель не забирает фокус.
	 */
	private __toolbarButtons(): ToolbarButton[] {
		// без персонализации кнопки нет вовсе: нажимать её было бы не за чем
		const personalization: ToolbarButton[] = this.personalization
			? [
					{
						name: "variable",
						title: "Вставить переменную",
						icon: variableIcon,
						isEnabled: () => !this.__inMarkup(),
						run: () =>
							this.__openModal((apply) => new VariablesModal(this.variables, apply, this.variablesEmpty)),
					},
				]
			: [];

		return [
			{
				name: "randomize",
				title: "Рандомизация текста",
				icon: randomIcon,
				isEnabled: () => !this.__inMarkup(),
				run: () => {
					const selected = this.__editor.selection?.toString() ?? "";
					this.__openModal((apply) => new RandomizerModal(selected, apply));
				},
			},
			...personalization,
		];
	}

	private __initEmoji(button: HTMLElement, container: HTMLElement) {
		const { signal } = this.__listenerAbort;

		// кнопка не забирает фокус — иначе редактор потеряет каретку, а вместе с ней и место вставки
		button.addEventListener("mousedown", (e) => e.preventDefault(), { signal });
		button.addEventListener(
			"click",
			(e) => {
				if (this.disabled || this.readonly) return;

				// без этого PopupManager получит тот же клик своим слушателем на body и закроет панель
				e.stopPropagation();

				// каретку редактор ставит сам, если её не было, — и в нужном порядке с показом панели
				this.__editor.openEmojiPicker(button, container);
			},
			{ signal }
		);
	}

	/** Доступ к встроенному редактору (выделение, вставка текста и т.п.). */
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
		this.__syncValue(); // значение читают снаружи — отложенное изменение сюда обязано попасть
		return this.__valueElem.value.trim();
	}

	setValue(value: string): void {
		// RichEditor нормализует значение и поднимет change — он же обновит носитель значения
		this.__editor.setValue(value?.trim() ?? "");
	}

	// Правила проверяет браузер по атрибутам поля-носителя; контрол отражает результат классом.
	override validate(): boolean {
		const isValid = super.validate(); // super синхронизирует значение сам, через __syncValue

		this.element.classList.toggle("invalid", !isValid);

		return isValid;
	}

	override destroy(): void {
		this.__disposing = true;

		// Окно правки живёт в body, а не внутри компонента: само оно не исчезнет, а его кнопки
		// правили бы уже снятый редактор. Закрываем до него — обработчику закрытия нужен живой.
		this.__modal?.close();

		this.__listenerAbort.abort();
		this.__editor.destroy();

		super.destroy(); // снимет слушатели формы и вернёт поле-носитель в исходный вид
	}
}

export interface ChangeEventData {
	editor: MessageEditor;
	value: string;
}
