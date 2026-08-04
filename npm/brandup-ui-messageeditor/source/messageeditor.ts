import "./messageeditor.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { DOM } from "@brandup/ui";
import RichEditor, { ALL_FORMAT_TOOLS } from "@brandup/ui-richeditor";
import emojiIcon from "../svg/emoji.svg";

export const ROOT_CLASS = "ui-messageeditor";
export const INPUT_CLASS = "messageeditor-input";
export const EMOJI_CLASS = "messageeditor-emoji";
export const CHANGE_EVENT = "messageeditor-change";

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

	readonly placeholder: string | null;

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement) {
		valueElem.classList.add(INPUT_CLASS);

		const placeholder = valueElem.getAttribute("placeholder");
		const disabled = valueElem.disabled;
		const readonly = valueElem.hasAttribute("readonly") || valueElem.hasAttribute("data-readonly");

		const inputElem = DOM.tag("div");
		// кнопка смайлика — часть компонента, а не тулбара: она нужна рядом с плашкой и доступна
		// сразу, не дожидаясь фокуса (тулбар появляется только по нему)
		const emojiElem = disabled
			? null
			: DOM.tag("button", { type: "button", class: EMOJI_CLASS, title: "Вставить смайлик" }, emojiIcon);

		const container = DOM.tag("div", { class: [ROOT_CLASS].concat(Array.from(valueElem.classList)) }, [
			DOM.tag("div", { class: "bubble" }, [inputElem, emojiElem]),
		]);

		container.classList.remove(INPUT_CLASS);

		// в фокус попадает редактируемый элемент, а не скрытый носитель значения
		inputElem.tabIndex = disabled ? -1 : valueElem.tabIndex;
		valueElem.tabIndex = -1;

		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		super("BrandUp.MessageEditor", container, valueElem);

		this.placeholder = placeholder;
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
			// значение хранится разметкой мессенджеров, а не HTML
			storage: "markdown",
			// панель показывается над плашкой, а не над document.body
			toolbarContainer: container,
			value: valueElem.value,
			onEnter: () => this.__submitForm(),
		});

		// RichEditor про disabled не знает — запрещаем правку на своей стороне
		// (визуал даёт класс .disabled от InputControl)
		if (disabled) inputElem.contentEditable = "false";

		// приводим носитель значения к нормализованному содержимому редактора (без события)
		this.__valueElem.value = this.__editor.getValue();

		this.__initLogic();
		if (emojiElem) this.__initEmoji(emojiElem, container);
	}

	private __initLogic() {
		const { signal } = this.__listenerAbort;
		const editable = this.__inputElem;

		this.__editor.onChange((data) => {
			this.__valueElem.value = data.value;

			if (this.element.classList.contains("invalid") && this.validate()) this.element.classList.remove("invalid");

			this.trigger(CHANGE_EVENT, <ChangeEventData>{ editor: this, value: this.getValue() });
		});

		// состояние фокуса — на корневом элементе, плашка подсвечивается целиком
		editable.addEventListener("focus", () => !this.disabled && this.element.classList.add("focused"), { signal });
		editable.addEventListener("blur", () => !this.disabled && this.element.classList.remove("focused"), { signal });

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

				// По кнопке могли кликнуть, ни разу не заходя в поле — тогда каретки нет и вставлять
				// символ некуда; focus() поставит её в конец сообщения. Но фокусировать вслепую
				// нельзя: focus() сбрасывает уже стоящую каретку в начало, и смайлик уезжает туда же.
				const selection = window.getSelection();
				const hasCaret = !!selection?.rangeCount && this.__inputElem.contains(selection.anchorNode);
				if (!hasCaret) this.__editor.focus();

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
		return this.__valueElem.value.trim();
	}

	setValue(value: string): void {
		// RichEditor нормализует значение и поднимет change — он же обновит носитель значения
		this.__editor.setValue(value?.trim() ?? "");
	}

	override validate(): boolean {
		let isValid = super.validate();
		if (isValid && this.required && !this.getValue()) isValid = false;

		this.element.classList.toggle("invalid", !isValid);

		return isValid;
	}

	override destroy(): void {
		this.__listenerAbort.abort();
		this.__editor.destroy();

		this.__valueElem.tabIndex = this.__inputElem.tabIndex;
		this.element.insertAdjacentElement("afterend", this.__valueElem);
		this.element.remove();

		super.destroy();
	}
}

export interface ChangeEventData {
	editor: MessageEditor;
	value: string;
}
