import "./messageeditor.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { DOM } from "@brandup/ui";
import RichEditor, { ALL_FORMAT_TOOLS, preserveCaret, type ToolbarButton } from "@brandup/ui-richeditor";
import { highlight, SPINTAX_CLASS, VARIABLE_CLASS } from "./highlight";
import RandomizerModal from "./randomizer";
import VariablesModal, { type MessageVariable } from "./variables";
import emojiIcon from "../svg/emoji.svg";
import randomIcon from "../svg/random.svg";
import variableIcon from "../svg/variable.svg";

export const ROOT_CLASS = "ui-messageeditor";
export const INPUT_CLASS = "messageeditor-input";
export const EMOJI_CLASS = "messageeditor-emoji";
export const CHANGE_EVENT = "messageeditor-change";

export interface MessageEditorOptions {
	/** Переменные персонализации для кнопки в панели; пусто — список в окне будет пустым. */
	variables?: MessageVariable[];
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

	readonly placeholder: string | null;
	readonly variables: MessageVariable[];

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement, options: MessageEditorOptions = {}) {
		const placeholder = valueElem.getAttribute("placeholder");
		const tabIndexAttr = valueElem.getAttribute("tabindex");
		const disabled = valueElem.disabled;
		const readonly = valueElem.hasAttribute("readonly") || valueElem.hasAttribute("data-readonly");

		const inputElem = DOM.tag("div");
		// кнопка смайлика — часть компонента, а не тулбара: она нужна рядом с плашкой и доступна
		// сразу, не дожидаясь фокуса (тулбар появляется только по нему)
		const emojiElem = disabled
			? null
			: DOM.tag("button", { type: "button", class: EMOJI_CLASS, title: "Вставить смайлик" }, emojiIcon);

		const container = DOM.tag("div", { class: ROOT_CLASS }, [
			DOM.tag("div", { class: "bubble" }, [inputElem, emojiElem]),
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
		this.variables = options.variables ?? [];
		this.__inputElem = inputElem;

		this.__editor = new RichEditor(inputElem, {
			placeholder,
			multiline: true,
			// Enter переносит строку, а не создаёт абзац: иначе каждое нажатие уходило бы
			// в значение пустой строкой. Абзац набирается двумя переносами, как в мессенджерах.
			paragraph: "break",
			// disabled для редактора — тот же запрет правок, что и readonly (сам он про disabled не знает)
			readonly: readonly || disabled,
			// набор мессенджера: жирный, курсив, зачёркнутый, подчёркнутый. Смайлики в тулбар
			// не выводим — для них своя кнопка рядом с плашкой. В disabled форматирование
			// выключено целиком: без инструментов панель не строится и не показывается.
			format: !disabled,
			tools: ALL_FORMAT_TOOLS,
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
		if (emojiElem) this.__initEmoji(emojiElem, container);

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

		// правка конструкций — только через своё окно: в тексте они атомарны
		editable.addEventListener(
			"click",
			(e) => {
				if (this.disabled || this.readonly) return;

				const span = (e.target as HTMLElement).closest?.(`span.${VARIABLE_CLASS}, span.${SPINTAX_CLASS}`);
				if (span) this.__editMarkup(span as HTMLElement);
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
	 * Подсветка спинтакса и переменных. Текст от неё не меняется, поэтому каретка
	 * восстанавливается по смещениям точно; возвращаем её всякий раз, когда разметку
	 * перестраивали, — обёртки собираются заново, и старое выделение указывало бы в никуда.
	 *
	 * Во время IME-композиции не вмешиваемся: перестановка каретки прервала бы набор.
	 */
	private __highlight() {
		if (this.__composing) return;

		preserveCaret(this.__inputElem, () => highlight(this.__inputElem));
	}

	/** Открывает окно правки конструкции; результат заменяет её целиком. */
	private __editMarkup(span: HTMLElement) {
		const replace = (text: string) => {
			// выделяем конструкцию целиком — insertText заменит выделенное
			this.__editor.selectNode(span);
			this.__editor.insertText(text);
		};

		if (span.classList.contains(VARIABLE_CLASS)) new VariablesModal(this.variables, replace);
		else new RandomizerModal(span.textContent ?? "", replace);
	}

	/** Стоит ли выделение внутри готовой конструкции — вкладывать их друг в друга нельзя. */
	private __inMarkup(): boolean {
		const selection = this.__editor.selection;
		if (!selection) return false;

		const node = selection.anchorNode;
		const elem = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node?.parentElement;

		return !!elem?.closest(`span.${VARIABLE_CLASS}, span.${SPINTAX_CLASS}`);
	}

	/**
	 * Кнопки панели, которых нет в редакторе. Обе открывают модальное окно и вставляют
	 * результат в каретку; выделение к этому моменту сохранено — панель не забирает фокус.
	 */
	private __toolbarButtons(): ToolbarButton[] {
		return [
			{
				name: "randomize",
				title: "Рандомизация текста",
				icon: randomIcon,
				isEnabled: () => !this.__inMarkup(),
				run: () => {
					const selected = this.__editor.selection?.toString() ?? "";
					new RandomizerModal(selected, (spintax) => this.__replaceSelection(spintax));
				},
			},
			{
				name: "variable",
				title: "Вставить переменную",
				icon: variableIcon,
				isEnabled: () => !this.__inMarkup(),
				run: () => new VariablesModal(this.variables, (text) => this.__editor.insertText(text)),
			},
		];
	}

	// Рандомизация заменяет то, что было выделено: insertText сам затирает выделение,
	// но каретка могла уехать, пока было открыто окно, — восстанавливаем её на редакторе.
	private __replaceSelection(text: string) {
		this.__editor.focus();
		this.__editor.insertText(text);
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
		this.__listenerAbort.abort();
		this.__editor.destroy();

		super.destroy(); // снимет слушатели формы и вернёт поле-носитель в исходный вид
	}
}

export interface ChangeEventData {
	editor: MessageEditor;
	value: string;
}
