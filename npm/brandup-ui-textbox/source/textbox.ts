import "./textbox.less"; // стили компонента

import { InputControl } from "@brandup/ui-input";
import { IS_TOUCH_DEVICE, SCROLLABLE_CLASS } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui";
import { FuncHelper } from "@brandup/ui-helpers";
import RichEditor, {
	defaultFormatMarkers,
	parseBlockTypes,
	parseEditorActions,
	parseFormatTools,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
	type RichEditorOptions,
} from "@brandup/ui-richeditor";
import copyIcon from "../svg/copy.svg";
import doneIcon from "../svg/tick.svg";

export const ROOT_CLASS = "ui-textbox";
export const INPUT_CLASS = "textbox-input";
export const MINIATURE_CLASS = "textbox-miniature";
export const CHANGE_EVENT = "textbox-change";
export const MAX_EMAIL_LENGTH = 256; // https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3

export type TextBoxType = "text" | "email" | "url" | "tel" | "number";

// Атрибуты поля, которые компонент подменяет под себя (фокус уходит на редактируемый элемент,
// ограничения типа нормализуются). При destroy возвращаем их ровно в исходное состояние —
// иначе после снятия компонента поле остаётся с чужими ограничениями.
const ATTRS_TO_RESTORE = ["tabindex", "maxlength", "step"];

type TextBoxEvents = {
	[CHANGE_EVENT]: (data: ChangeEventData) => void;
};

export default class TextBox extends InputControl<HTMLInputElement | HTMLTextAreaElement, TextBoxEvents> {
	private __editor: RichEditor;
	private __inputElem: HTMLElement; // редактируемый элемент (им владеет RichEditor)
	private __symbolsCountElem: HTMLElement;
	private __listenerAbort = new AbortController();

	readonly type: TextBoxType;
	readonly allowEmptyStrings: boolean;
	readonly multyline: boolean;
	readonly placeholder: string | null;
	readonly copyButton: boolean;
	readonly maxlength: number;
	readonly inputmode: string;
	readonly symbolCounter: boolean;
	readonly autoFocus: boolean;
	readonly format: boolean;
	readonly formatStorage: FormatStorage;
	readonly formatTools: FormatTool[];
	readonly formatMarkers: FormatMarkers;

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement) {
		// исходные атрибуты запоминаем до любых правок — компонент их подменяет, а destroy возвращает
		const originalAttrs = ATTRS_TO_RESTORE.map(
			(name) => [name, valueElem.getAttribute(name)] as [string, string | null]
		);

		// определяем тип ввода и нормализуем валидационные атрибуты до super()
		let type: TextBoxType = "text";
		if (valueElem instanceof HTMLInputElement) {
			switch (valueElem.type) {
				case "text":
					type = "text";
					break;
				case "email":
					type = "email";
					// у поля без атрибута maxlength свойство равно -1, а не 0, поэтому проверять
					// нужно именно «не задан положительный предел», иначе ограничение RFC не применялось бы
					if (valueElem.maxLength <= 0 || valueElem.maxLength > MAX_EMAIL_LENGTH)
						valueElem.maxLength = MAX_EMAIL_LENGTH;
					break;
				case "url":
					type = "url";
					break;
				case "tel":
					type = "tel";
					break;
				case "number":
					type = "number";
					valueElem.step = "1"; // Поддерживаем пока что только целые числа
					break;
				default:
					throw new Error(`Тип ввода ${valueElem.type} не поддерживается.`);
			}
		}

		const maxlength = valueElem.maxLength;
		const symbolCounter = valueElem.hasAttribute("data-symbolcounter");
		const autoFocus = valueElem.hasAttribute("data-autofocus");
		const allowEmptyStrings = valueElem.hasAttribute("data-allow-empty-strings");
		const placeholder = valueElem.getAttribute("placeholder");
		const inputmode = valueElem.inputMode;
		const multyline = valueElem instanceof HTMLTextAreaElement;
		const copyButton = valueElem.hasAttribute("data-copy-button") || valueElem.hasAttribute("data-copybutton");
		const disabled = valueElem.disabled;
		const readonly = valueElem.hasAttribute("readonly") || valueElem.hasAttribute("data-readonly");

		// форматирование доступно только для обычного текстового ввода
		const format = type === "text" && valueElem.hasAttribute("data-format");
		const formatStorage: FormatStorage = valueElem.dataset.formatStorage === "markdown" ? "markdown" : "html";
		const formatTools = format ? parseFormatTools(valueElem.dataset.formatTools ?? null) : [];
		// кнопки действий панели (очистка формата, отмена, повтор) — подключаются явно
		const editorActions = format ? parseEditorActions(valueElem.dataset.editorActions ?? null) : [];
		// типы блоков (цитата, блок кода) — тоже явно и только в многострочном поле
		const blocks = parseBlockTypes(multyline ? (valueElem.dataset.blocks ?? null) : null);

		// markdown-маркеры с дефолтами, переопределяются атрибутами data-format-md-<tool>
		const formatMarkers = defaultFormatMarkers();
		if (format) {
			for (const tool of Object.keys(formatMarkers) as FormatTool[]) {
				// имя атрибута собирается на ходу: у dataset оно потребовало бы ручного camelCase
				const marker = valueElem.getAttribute(`data-format-md-${tool}`)?.trim();
				if (marker) formatMarkers[tool] = marker;
			}
		}

		const inputElem = DOM.tag("div");
		const actionsElem = DOM.tag("div", { class: "actions" });
		const symbolsCountElem = DOM.tag("div", { class: "symbols" });

		const container = DOM.tag("div", { class: ROOT_CLASS }, [
			DOM.tag("div", { class: "decorator" }),
			DOM.tag("div", { class: ["editor", SCROLLABLE_CLASS] }, [inputElem, symbolsCountElem]),
			actionsElem,
		]);

		TextBox.prepareValueElem(valueElem, container, INPUT_CLASS);

		inputElem.tabIndex = disabled ? -1 : valueElem.tabIndex;
		valueElem.tabIndex = -1;

		if (multyline) container.classList.add("multyline");
		if (symbolCounter) container.classList.add("counter");
		if (inputmode) inputElem.inputMode = inputmode;

		if (copyButton) {
			// команда объявляется атрибутом data-command — по нему её ищет обработчик @brandup/ui
			const buttonElem = DOM.tag(
				"button",
				{ command: "copy-text", title: "Скопировать в буфер обмена" },
				copyIcon
			);
			if (disabled) buttonElem.disabled = true;
			actionsElem.insertAdjacentElement("beforeend", buttonElem);
		}

		// убираем висящую миниатюру, если есть, и вставляем container на место valueElem
		if (valueElem.nextElementSibling) {
			const nextElem = valueElem.nextElementSibling as HTMLElement;
			if (nextElem.classList.contains(MINIATURE_CLASS)) nextElem.remove();
		}
		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		// класс и подменённые атрибуты вернёт базовый класс при destroy
		super("BrandUp.TextBox", container, valueElem, { class: INPUT_CLASS, attrs: originalAttrs });

		this.type = type;
		this.maxlength = maxlength;
		this.symbolCounter = symbolCounter;
		this.autoFocus = autoFocus;
		this.allowEmptyStrings = allowEmptyStrings;
		this.placeholder = placeholder;
		this.inputmode = inputmode;
		this.multyline = multyline;
		this.copyButton = copyButton;
		this.format = format;
		this.formatStorage = formatStorage;
		this.formatTools = formatTools;
		this.formatMarkers = formatMarkers;

		this.__inputElem = inputElem;
		this.__symbolsCountElem = symbolsCountElem;

		// фильтрация ввода по типу, ограничение длины и обработка submit/ошибок — через хуки RichEditor
		// (RichEditor про maxlength/типы не знает; всё это контролирует TextBox)
		const options: RichEditorOptions = {
			format,
			tools: formatTools,
			actions: editorActions,
			storage: formatStorage,
			markers: formatMarkers,
			placeholder,
			multiline: multyline,
			blocks,
			readonly,
			// тулбар позиционируется относительно контейнера TextBox (а не document.body)
			toolbarContainer: container,
			value: valueElem.value,
			onReject: () => this.__toIncorrect(),
			onEnter: () => this.__requestSubmit(),
		};

		// допустим ли вводимый символ по типу.
		// `+` в адресе — обычное дело (подадреса вида user+tag@example.com), без него такие
		// адреса нельзя было бы набрать; остальные разрешённые в local-part символы редки
		const typeAllowsChar = (char: string) => {
			if (type === "number") return /\d/.test(char);
			if (type === "email") return /[a-zA-Z\d.\-_+@]/.test(char);
			return true;
		};

		if (type === "number" || type === "email" || maxlength > 0) {
			options.filterChar = (char) => {
				// достигнут лимит длины — отклоняем (выделение будет заменено, поэтому вычитаем его длину)
				if (maxlength > 0) {
					const selectionLength = window.getSelection()?.toString().length ?? 0;
					if (this.__editor.getLength() - selectionLength >= maxlength) return false;
				}
				return typeAllowsChar(char);
			};
		}

		if (type === "number" || maxlength > 0) {
			options.filterPaste = (text) => {
				let pasted = text;

				if (type === "number") {
					const numberData = /[\d\s]+/.exec(pasted);
					if (!numberData || !numberData.length) return null;
					pasted = numberData[0].replace(/\s/g, "");
				}

				// обрезаем по количеству оставшихся символов (с учётом замены выделения)
				if (maxlength > 0) {
					const selectionLength = window.getSelection()?.toString().length ?? 0;
					const left = maxlength - this.__editor.getLength() + selectionLength;
					// не влезает ни одного символа — это отказ, а не пустая вставка: иначе
					// вставка молча не делала бы ничего, тогда как ввод символа на пределе мигает ошибкой
					if (left <= 0) return null;
					if (pasted.length > left) pasted = pasted.substring(0, left);
				}

				return pasted;
			};
		}

		this.__editor = new RichEditor(inputElem, options);

		// RichEditor не знает про disabled — отключаем редактирование на стороне TextBox
		// (визуал даёт класс .disabled от InputControl: затемнение, user-select: none)
		if (disabled) inputElem.contentEditable = "false";

		// синхронизируем скрытое поле с нормализованным содержимым редактора (без события)
		this.__valueElem.value = this.__editor.getValue();

		this.__initLogic();
		this.__refreshSymbolsCount();

		if (this.autoFocus && !IS_TOUCH_DEVICE && !disabled && !readonly) this.__editor.focus();
	}

	private __initLogic() {
		const { signal } = this.__listenerAbort;
		const editable = this.__inputElem;

		// изменения редактора → значение формы, счётчик, валидность, событие
		this.__editor.onChange((data) => {
			this.__valueElem.value = data.value;

			this.__refreshSymbolsCount();

			let clearInvalidState = true;
			if (this.element.classList.contains("invalid")) clearInvalidState = this.validate();
			if (clearInvalidState) this.element.classList.remove("invalid");

			this.__onChange();
		});

		// Счётчик — на каждый ввод, а не по change: длина считается по textContent и стоит копейки,
		// тогда как значение поля синхронизируется реже (см. RichEditor.flushChange).
		editable.addEventListener("input", () => this.__refreshSymbolsCount(), { signal });

		// состояние фокуса контрола (рамка/заливка) — на корневом элементе
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

		// двойной клик по readonly-полю с кнопкой копирования — выделить всё для копирования
		if (this.copyButton) {
			editable.addEventListener(
				"dblclick",
				() => {
					if (this.disabled || !this.readonly) return;
					editable.focus();
					window.getSelection()?.selectAllChildren(editable);
				},
				{ signal }
			);
		}

		this.registerCommand("copy-text", async (context) => {
			// повторный клик, пока показана галочка, запомнил бы её как исходную иконку —
			// после возврата кнопка так и осталась бы с галочкой
			if (!window.navigator.clipboard || this.disabled || context.target.classList.contains("success")) return;

			await window.navigator.clipboard.writeText(this.__valueElem.value);

			const prevHtml = context.target.innerHTML;
			context.target.innerHTML = doneIcon;
			context.target.classList.add("success");

			// возврат иконки отменяем вместе с компонентом: иначе таймер переживает destroy
			// и дописывает в уже отсоединённую кнопку
			try {
				await FuncHelper.delay(2000, signal);
			} catch {
				return;
			}

			context.target.innerHTML = prevHtml;
			context.target.classList.remove("success");
		});
	}

	// Редактор откладывает событие изменения при печати, поэтому копия значения в поле формы
	// отстаёт. Базовый класс зовёт этот хук перед каждым чтением значения снаружи —
	// валидация, отправка формы, сбор FormData.
	protected override __syncValue(): void {
		this.__editor.flushChange();
		this.__refreshValidity();
	}

	/**
	 * Собственное ограничение контрола объявляем полю через setCustomValidity — дальше всё
	 * делает браузер, как с нативными `required` и `pattern`: блокирует отправку и поднимает
	 * invalid. Иначе правило работало бы только в нашем validate(), а форма уезжала бы.
	 *
	 * Длину меряем по видимому тексту, а не по значению: при format/html в нём теги, в multiline —
	 * разделители абзацев. Нативный maxLength здесь не помощник: он ограничивает набор, но не
	 * помечает значение, выставленное из кода.
	 */
	private __refreshValidity(): void {
		if (this.maxlength <= 0) return;

		const tooLong = this.maxlength < this.__editor.getLength();
		this.__valueElem.setCustomValidity(tooLong ? `Не больше ${this.maxlength} символов.` : "");
	}

	private __toIncorrect() {
		this.element.classList.add("incorrect");
		window.setTimeout(() => this.element.classList.remove("incorrect"), 200);
	}

	private __refreshSymbolsCount() {
		if (!this.__symbolsCountElem) return;

		const textLength = this.__editor.getLength();
		let counterValue: string;

		if (this.maxlength > 0) {
			counterValue = `${textLength}/${this.maxlength}`;
			if (this.maxlength < textLength) this.__symbolsCountElem.classList.add("invalid");
			else this.__symbolsCountElem.classList.remove("invalid");
		} else counterValue = textLength.toString();

		this.__symbolsCountElem.textContent = counterValue;
	}

	private __onChange() {
		this.trigger(CHANGE_EVENT, <ChangeEventData>{
			textbox: this,
			value: this.getValue(),
		});
	}

	/** Многострочный режим (textarea). Псевдоним без опечатки в имени. */
	get multiline(): boolean {
		return this.multyline;
	}

	/** Доступ к встроенному редактору (форматирование, выделение и т.п.). */
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
		// RichEditor нормализует и сгенерирует change — он синхронизирует скрытое поле и вызовет textbox-change
		this.__editor.setValue(value?.trim() ?? "");
	}

	override validate(): boolean {
		let isValid = super.validate(); // super синхронизирует значение сам, через __syncValue
		if (isValid) {
			const value = this.getValue();

			if (this.required && !value) isValid = false;

			// длина — по видимому тексту (getLength), а не по сериализованному value:
			// при format/html в value есть теги, в multiline — разделители абзацев \n\n
			if (this.maxlength > 0 && this.maxlength < this.__editor.getLength()) isValid = false;
		}

		if (!isValid) this.element.classList.add("invalid");
		else this.element.classList.remove("invalid");

		return isValid;
	}

	override destroy(): void {
		this.__listenerAbort.abort();
		this.__editor.destroy();

		super.destroy(); // снимет слушатели формы и вернёт поле-носитель в исходный вид
	}
}

export interface ChangeEventData {
	textbox: TextBox;
	value: string;
}
