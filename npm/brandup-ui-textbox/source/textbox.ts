import "./textbox.less"; // стили компонента

import { EditorInputControl, parseFocusCaret } from "@brandup/ui-input";
import { POPUP_CLASS, SCROLLABLE_CLASS } from "@brandup/ui-kit";
import { DOM } from "@brandup/ui";
import { FuncHelper } from "@brandup/ui-helpers";
import RichEditor, {
	TOOLBAR_CLASS,
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

export default class TextBox extends EditorInputControl<RichEditor, ChangeEventData, TextBoxEvents> {
	private __inputElem: HTMLElement; // редактируемый элемент (им владеет RichEditor)
	private __symbolsCountElem: HTMLElement;
	private __incorrectTimer?: number;

	readonly type: TextBoxType;
	readonly allowEmptyStrings: boolean;
	readonly multyline: boolean;
	readonly placeholder: string | null;
	readonly copyButton: boolean;
	readonly maxlength: number;
	readonly inputmode: string;
	readonly symbolCounter: boolean;
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
		// куда встаёт каретка при фокусе из кода: data-caret="start|end|all", по умолчанию в конец
		const caret = parseFocusCaret(valueElem.dataset.caret);
		const allowEmptyStrings = valueElem.hasAttribute("data-allow-empty-strings");
		const placeholder = valueElem.getAttribute("placeholder");
		const inputmode = valueElem.inputMode;
		const multyline = valueElem instanceof HTMLTextAreaElement;
		const copyButton = valueElem.hasAttribute("data-copy-button") || valueElem.hasAttribute("data-copybutton");
		const disabled = valueElem.disabled;
		const readonly = TextBox.isReadonly(valueElem);

		// форматирование доступно только для обычного текстового ввода
		const format = type === "text" && valueElem.hasAttribute("data-format");
		const formatStorage: FormatStorage = valueElem.dataset.formatStorage === "markdown" ? "markdown" : "html";
		const formatTools = format ? parseFormatTools(valueElem.dataset.formatTools ?? null) : [];
		// кнопки действий панели (очистка формата, отмена, повтор) — подключаются явно
		const editorActions = format ? parseEditorActions(valueElem.dataset.editorActions ?? null) : [];
		// Типы блоков (цитата, блок кода) — тоже явно и только в многострочном поле. Без атрибута
		// список пуст, а не «не задан»: незаданный редактор понимает как «все», и в поле без единого
		// объявления всплывала бы панель с кнопками цитаты и кода.
		const blocks =
			multyline && valueElem.dataset.blocks !== undefined ? parseBlockTypes(valueElem.dataset.blocks) : [];

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

		if (multyline) container.classList.add("multyline");
		if (symbolCounter) container.classList.add("counter");
		if (inputmode) inputElem.inputMode = inputmode;

		if (copyButton) {
			// команда объявляется атрибутом data-command — по нему её ищет обработчик @brandup/ui;
			// type обязателен: кнопка без него внутри формы — submit, и клик отправлял бы форму
			const buttonElem = DOM.tag(
				"button",
				{ type: "button", command: "copy-text", title: "Скопировать в буфер обмена" },
				copyIcon
			);
			if (disabled) buttonElem.disabled = true;
			actionsElem.insertAdjacentElement("beforeend", buttonElem);
		}

		// убираем висящую миниатюру, если есть, — до обёртки поля: после неё соседом поля станет контейнер
		if (valueElem.nextElementSibling) {
			const nextElem = valueElem.nextElementSibling as HTMLElement;
			if (nextElem.classList.contains(MINIATURE_CLASS)) nextElem.remove();
		}

		// скрыть поле, подменить tabindex и обернуть контейнером — общая механика базового класса
		TextBox.wrapValueElem(valueElem, container, INPUT_CLASS, inputElem, disabled);

		// класс и подменённые атрибуты вернёт базовый класс при destroy
		super(
			"BrandUp.TextBox",
			container,
			valueElem,
			{ class: INPUT_CLASS, attrs: originalAttrs },
			{ changeEvent: CHANGE_EVENT, caret }
		);

		this.type = type;
		this.maxlength = maxlength;
		this.symbolCounter = symbolCounter;
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
			// disabled редактор знает сам: запрет правок как в readonly, плюс снятый contenteditable —
			// без фокуса и выделения (визуал даёт класс .disabled от InputControl)
			disabled,
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
				// достигнут лимит длины — отклоняем (выделение будет заменено, его длину учитывает helper)
				if (maxlength > 0 && this.__lengthLeft() <= 0) return false;
				return typeAllowsChar(char);
			};

			options.filterPaste = (text) => {
				let pasted = text;

				if (type === "number") {
					const numberData = /[\d\s]+/.exec(pasted);
					if (!numberData || !numberData.length) return null;
					pasted = numberData[0].replace(/\s/g, "");
				} else if (type === "email") {
					// вставка проходит тот же посимвольный фильтр, что и набор, — иначе запрещённые
					// символы попадали бы в поле через буфер обмена
					pasted = Array.from(pasted).filter(typeAllowsChar).join("");
					if (!pasted) return null;
				}

				// обрезаем по количеству оставшихся символов (с учётом замены выделения)
				if (maxlength > 0) {
					const left = this.__lengthLeft();
					// не влезает ни одного символа — это отказ, а не пустая вставка: иначе
					// вставка молча не делала бы ничего, тогда как ввод символа на пределе мигает ошибкой
					if (left <= 0) return null;
					if (pasted.length > left) pasted = pasted.substring(0, left);
				}

				return pasted;
			};
		}

		this.__attachEditor(new RichEditor(inputElem, options));

		// синхронизируем скрытое поле с нормализованным содержимым редактора (без события)
		this.__valueElem.value = this.__editor.getValue();

		this.__initLogic();
		this.__refreshSymbolsCount();
		// значение из разметки может уже нарушать лимит длины — объявляем это полю сразу,
		// не дожидаясь первой синхронизации
		this.__refreshValidity();

		this.__applyAutoFocus(); // автофокус — вместе с прокруткой к полю; условия у базового класса
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
		// Выключенный счётчик скрыт — пересчитывать его на каждое нажатие незачем.
		if (this.symbolCounter) editable.addEventListener("input", () => this.__refreshSymbolsCount(), { signal });

		// Клик мимо текста — тоже клик по полю: контрол выглядит одним полем ввода, а его
		// внутренние отступы, место справа от текста и полоса действий в редактируемый
		// элемент не входят.
		this.element.addEventListener("mousedown", (e) => this.__focusFromBox(e), { signal });

		// таймер вспышки "incorrect" не должен переживать компонент — гасим его вместе со слушателями
		signal.addEventListener("abort", () => window.clearTimeout(this.__incorrectTimer));

		if (this.copyButton) {
			// двойной клик по readonly-полю с кнопкой копирования — выделить всё для копирования
			editable.addEventListener(
				"dblclick",
				() => {
					if (this.disabled || !this.readonly) return;
					editable.focus();
					window.getSelection()?.selectAllChildren(editable);
				},
				{ signal }
			);

			this.registerCommand("copy-text", async (context) => {
				// повторный клик, пока показана галочка, запомнил бы её как исходную иконку —
				// после возврата кнопка так и осталась бы с галочкой
				if (!window.navigator.clipboard || this.disabled || context.target.classList.contains("success"))
					return;

				// копия значения в поле отстаёт на окно троттлинга — доводим её перед чтением
				this.__syncValue();
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
	}

	/**
	 * Фокус по клику в контрол мимо текста: внутренние отступы, место справа от последней
	 * строки и полоса действий в редактируемый элемент не входят, а выглядит всё это одним
	 * полем ввода.
	 *
	 * Гасим нажатие: браузер иначе снял бы выделение и увёл фокус на корневой элемент, где
	 * каретке места нет. Каретку редактор вернёт на прежнее место, а если её ещё не было —
	 * в конец текста: клик мимо текста это клик за ним.
	 */
	private __focusFromBox(e: MouseEvent) {
		// в выключенном поле редактируемого элемента нет вовсе — фокусировать нечего
		if (this.disabled) return;

		const target = e.target as HTMLElement | null;
		if (!target || this.__inputElem.contains(target)) return; // в сам текст браузер попадёт и сам

		// кнопка копирования, панель форматирования и её попапы живут внутри контрола и работают сами
		if (target.closest(`button, a, input, textarea, select, .${TOOLBAR_CLASS}, .${POPUP_CLASS}`)) return;

		e.preventDefault();
		this.__editor.focus(true);
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
	protected override __refreshValidity(): void {
		if (this.maxlength <= 0) return;

		const tooLong = this.maxlength < this.__editor.getLength();
		this.__valueElem.setCustomValidity(tooLong ? `Не больше ${this.maxlength} символов.` : "");
	}

	/**
	 * Сколько символов ещё поместится с учётом того, что выделение будет заменено вводом.
	 *
	 * Выделение берём у самого редактора: чужое выделение страницы (например, при вставке
	 * с отсоединённой кареткой) к содержимому отношения не имеет и ёмкость не освобождает.
	 * Длину выделения меряем так же, как getLength(), — по textContent, без переносов на границах
	 * блоков, которые toString() у Selection добавляет, — иначе многострочное выделение
	 * считалось бы длиннее содержимого.
	 */
	private __lengthLeft(): number {
		const selection = this.__editor.selection;
		const selectionLength = selection ? (selection.getRangeAt(0).cloneContents().textContent?.length ?? 0) : 0;

		return this.maxlength - this.__editor.getLength() + selectionLength;
	}

	private __toIncorrect() {
		this.element.classList.add("incorrect");

		// каждый отказ перезапускает таймер: иначе таймер предыдущего отказа гасил бы вспышку раньше
		window.clearTimeout(this.__incorrectTimer);
		this.__incorrectTimer = window.setTimeout(() => this.element.classList.remove("incorrect"), 200);
	}

	private __refreshSymbolsCount() {
		if (!this.symbolCounter) return;

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
}

export interface ChangeEventData {
	textbox: TextBox;
	value: string;
}
