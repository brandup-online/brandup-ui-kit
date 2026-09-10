import "./messageeditor.less"; // стили компонента

import { EditorInputControl } from "@brandup/ui-input";
import { PopupManager, type Modal } from "@brandup/ui-kit";
import { UIKIT } from "@brandup/ui-kit/names";
import { MESSAGEEDITOR } from "./names";
import { DOM } from "@brandup/ui";
import RichEditor, {
	RICHEDITOR,
	createEmojiPicker,
	formatToolbar,
	parseBlockTypes,
	parseFormatTools,
	preserveCaret,
	safeUrl,
	type BlockType,
	type FormatStorage,
	type FormatTool,
	type ToolbarButton,
} from "@brandup/ui-richeditor";
import {
	anchorAfter,
	highlight,
	joinSplitMarkup,
	mapVariableNames,
	markupAt,
	markupBeside,
	mayHaveMarkup,
	messageLength as countLength,
	unknownVariables as findUnknownVariables,
	withoutAnchors,
	MARKUP_SELECTOR,
	type HighlightOptions,
	type VariableNames,
} from "./highlight";
import RandomizerModal from "./randomizer";
import VariablesModal, {
	VariableKeyModal,
	buildVariable,
	cleanVariables,
	parseVariables,
	type MessageVariable,
	type VariablesSetup,
} from "./variables";
import emojiIcon from "../svg/emoji.svg";
import randomIcon from "../svg/random.svg";
import variableIcon from "../svg/variable.svg";

/** Формат хранения значения: сообщение уходит разметкой мессенджеров, а не HTML. */
const STORAGE: FormatStorage = "markdown";

/**
 * Режимы показа: сообщение и его выход. Подпись выхода — название разметки, знакомое пишущему
 * («Markdown»), и задана здесь текстом: формат хранения (STORAGE) решает, как значение
 * сериализуется, а не как называется кнопка, — сменится он, и подпись придётся выбирать заново.
 */
const MODES = [
	{ mode: "text", label: "Текст", title: "Показать сообщение" },
	{ mode: "source", label: "Markdown", title: "Показать разметку, какой значение уйдёт в форму" },
];

/**
 * Переключатель режимов над плашкой: текст сообщения или его выход в формате хранения.
 * Кнопки, а не ссылки: это действие в поле, а не переход. Возвращает и сами кнопки:
 * их состояние отражает режим, и искать их в готовой разметке было бы лишним обходом.
 */
function buildModes(): { elem: HTMLElement; buttons: HTMLButtonElement[] } {
	const buttons = MODES.map(
		({ mode, label, title }) =>
			DOM.tag(
				"button",
				{ type: "button", class: MESSAGEEDITOR.CLASS.ELEMENT.MODE, dataset: { mode }, title },
				label
			) as HTMLButtonElement
	);

	return { elem: DOM.tag("div", { class: MESSAGEEDITOR.CLASS.ELEMENT.MODES }, buttons), buttons };
}

/**
 * Гасит нажатие, чтобы элемент не забирал фокус: каретка и выделение редактора остаются
 * на месте, а сам клик по элементу доходит как обычно.
 */
function keepEditorFocus(elem: HTMLElement, signal: AbortSignal) {
	elem.addEventListener("mousedown", (e) => e.preventDefault(), { signal });
}

/**
 * Признак из атрибута поля-носителя: `data-*` без значения, `true` или `1` — да; `false` и `0` —
 * нет; нет атрибута — тоже нет.
 *
 * Одного присутствия мало: атрибут ставит сервер, а шаблон обычно печатает в него значение
 * (`data-personalization="false"`), а не решает, писать ли его вовсе, — и выключенный признак
 * выглядел бы включённым. Остальные значения считаем согласием, как у нативных булевых атрибутов:
 * написали — значит нужно.
 */
function dataFlag(dataset: DOMStringMap, name: string): boolean {
	const value = dataset[name];
	if (value === undefined) return false;

	const plain = value.trim().toLowerCase();

	return plain !== "false" && plain !== "0";
}

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
	 * Режим новых переменных: ключ, которого нет в объявленном списке, — не ошибка, а заявка
	 * на переменную, которую заведёт приложение. Отправку формы такая переменная не
	 * останавливает, в тексте помечается своим цветом (`span.variable.new`), а в окне
	 * персонализации становится записью с пометкой «новая» — чтобы её можно было вставить ещё раз.
	 * По умолчанию выключен: без него необъявленный ключ — ошибка значения.
	 *
	 * Список ключей, которые предстоит завести, отдаёт свойство {@link MessageEditor.unknownVariables}.
	 *
	 * Без этой опции берётся из разметки: атрибут `data-new-variables` поля-носителя.
	 * Объявленный режим — тоже согласие на персонализацию, как и объявленный список.
	 */
	newVariables?: boolean;
	/**
	 * Текст в окне персонализации, когда список пуст; по умолчанию — «Переменные не заданы.».
	 * Без него берётся из атрибута `data-variables-empty` поля-носителя.
	 *
	 * Причину пустого списка знает приложение: переменные могут появиться после выбора аудитории,
	 * а могут быть не предусмотрены вовсе — и подсказка в этих случаях нужна разная.
	 */
	variablesEmpty?: string | null;
	/**
	 * Настройка полей персонализации: ссылка последней строкой окна переменных. Строка — адрес
	 * перехода (обычная `<a href>`), функция — действие хоста: SPA-переход или своё окно.
	 * Окно переменных при нажатии закрывается молча, без возврата каретки в поле, — фокус
	 * уходит на другой экран; функция возвращает `false`, когда окно должно остаться открытым.
	 *
	 * Без этой опции адрес берётся из атрибута `data-variables-setup` поля-носителя.
	 * Объявленная настройка — тоже согласие на персонализацию, как и объявленный список.
	 */
	variablesSetup?: string | (() => void | boolean);
	/**
	 * Подпись ссылки на настройку полей; по умолчанию — «Настроить поля».
	 * Без неё берётся из атрибута `data-variables-setup-text` поля-носителя.
	 */
	variablesSetupText?: string;
	/**
	 * Block types of the message: quote, code block. Both are available by default; a channel does
	 * not understand everything, so the set is limited — an empty list leaves plain text only.
	 *
	 * Without this option it is taken from the `data-blocks` attribute of the value element
	 * (space-separated values).
	 */
	blocks?: BlockType[];
	/**
	 * Инструменты форматирования: жирный, курсив, зачёркнутый, подчёркнутый, спойлер,
	 * моноширинный. По умолчанию все; канал понимает не всё, поэтому набор ограничивают —
	 * пустой список оставляет текст без разметки вовсе.
	 *
	 * Кнопка, разметку которой канал не покажет, хуже отсутствующей: размеченный ею текст уйдёт
	 * получателю либо голым, либо сырыми маркерами. Ограничение набора значения не портит:
	 * снятая разметка остаётся в тексте как есть и уезжает обратно ровно такой же.
	 *
	 * Без этой опции берётся из атрибута `data-tools` поля-носителя (значения через пробел).
	 */
	tools?: FormatTool[];
	/**
	 * Держать ли фокус в поле, пока открыта панель смайликов. По умолчанию держим, а на
	 * сенсорном устройстве нет: там фокус поднимает экранную клавиатуру, а она закрывает собой
	 * саму панель. Окна персонализации и рандомизации фокус забирают всегда.
	 */
	keepFocus?: boolean;
	/**
	 * Показ выхода: переключатель над плашкой и панель рядом с ней, в которую рендерится значение
	 * в формате хранения. По умолчанию выключен — пишущему сообщение сырая разметка не нужна,
	 * а показанная без спроса требует объяснений.
	 *
	 * Без этой опции берётся из разметки: атрибут `data-source` поля-носителя.
	 */
	source?: boolean;
	/**
	 * Сколько символов отводится переменной при подсчёте {@link MessageEditor.messageLength};
	 * по умолчанию — 30 ({@link MESSAGEEDITOR.VALUE.DEFAULT_VARIABLE_LENGTH}).
	 * Ключ в тексте — не длина значения: `{ИМЯ}` может развернуться и в «Александра Константиновна».
	 * Сколько на самом деле — знает приложение, оно и задаёт.
	 *
	 * Без этой опции берётся из атрибута `data-variable-length` поля-носителя.
	 */
	variableLength?: number;
}

type MessageEditorEvents = {
	[MESSAGEEDITOR.EVENT.CHANGE]: (data: ChangeEventData) => void;
};

/**
 * Поле ввода сообщения: плашка чата поверх обычного поля формы.
 *
 * Устроен так же, как `@brandup/ui-textbox` — исходный `input`/`textarea` остаётся носителем
 * значения и участвует в форме, а ввод ведёт `RichEditor` в соседнем редактируемом элементе.
 *
 * Модель фиксирована под сообщение мессенджера: многострочность (сообщение — это абзацы),
 * панель форматирования с вставкой смайлика, значение в разметке мессенджеров вместо HTML.
 * Настраивается набор разметки — инструменты и типы блоков: «мессенджер» это не один канал,
 * и понимают они разное.
 */
export default class MessageEditor extends EditorInputControl<RichEditor, ChangeEventData, MessageEditorEvents> {
	private __inputElem: HTMLElement; // редактируемый элемент (им владеет RichEditor)
	private __composing = false; // идёт IME-ввод — подсветку откладываем
	private __names: VariableNames; // названия переменных по ключу — для подсветки
	private __highlightOptions: HighlightOptions; // всё, что подсветке нужно знать; за время жизни не меняется
	private __modal: Modal | null = null; // открытое окно правки — его закрывает и destroy
	private __emojiPicker: HTMLElement | null = null; // свой попап смайликов — см. __initEmoji
	private __disposing = false; // компонент снимают или уже сняли: фокус и каретку возвращать некуда
	private __sourceTextElem: HTMLElement | null; // текст панели выхода; её нет вовсе, пока показ не включён
	private __modeButtons: HTMLButtonElement[] = []; // кнопки переключателя — их состояние отражает режим
	private __sourceMode = false; // показан ли выход — см. sourceMode
	private __switching = false; // идёт переключение режима — см. __toggleSource
	private __modalSilent = false; // окно закрывают из кода — каретку в поле не возвращаем

	readonly placeholder: string | null;
	readonly variables: MessageVariable[];
	readonly variablesEmpty: string | null;
	readonly variablesSetup: string | (() => void | boolean) | null;
	readonly variablesSetupText: string;
	readonly personalization: boolean;
	readonly newVariables: boolean;
	readonly blocks: BlockType[];
	readonly tools: FormatTool[];
	readonly source: boolean;
	readonly variableLength: number;

	constructor(valueElem: HTMLInputElement | HTMLTextAreaElement, options: MessageEditorOptions = {}) {
		const placeholder = valueElem.getAttribute("placeholder");
		const tabIndexAttr = valueElem.getAttribute("tabindex");
		const disabled = valueElem.disabled;
		const readonly = MessageEditor.isReadonly(valueElem);

		// текст сообщения прокручивается сам — полоса оформляется общим классом кита
		const inputElem = DOM.tag("div", { class: UIKIT.SCROLLABLE.CLASS });
		// кнопка смайлика — часть компонента, а не тулбара: она нужна рядом с плашкой и доступна
		// сразу, не дожидаясь фокуса (тулбар появляется только по нему)
		const emojiElem = disabled
			? null
			: DOM.tag(
					"button",
					{ type: "button", class: MESSAGEEDITOR.CLASS.ELEMENT.EMOJI, title: "Вставить смайлик" },
					emojiIcon
				);

		// Собственная коробка кнопки: панель смайликов раскрывается от неё, а для этого нужен
		// позиционированный предок ровно по кнопке. От корня компонента панель вставала бы над
		// всем редактором, а не над кнопкой.
		const emojiHolder = emojiElem
			? DOM.tag("div", { class: MESSAGEEDITOR.CLASS.ELEMENT.EMOJI_HOLDER }, emojiElem)
			: null;

		// Показ выхода — по объявлению, а не всегда: сырая разметка нужна тому, кто её сверяет,
		// а пишущему сообщение она только мешает. Панель выхода прокручивается так же, как текст
		// в плашке, — общим классом кита.
		const source = options.source ?? dataFlag(valueElem.dataset, "source");
		const modes = source ? buildModes() : null;
		// tabindex — ради прокрутки: длинная разметка прокручивается в панели, а с клавиатуры
		// прокручивают только то, что можно взять в фокус (текст плашки берётся сам, он редактируемый).
		// Заглушка объясняет пустую панель так же, как в плашке; без заглушки атрибута нет вовсе
		// (null поставил бы его пустым — см. dataset в DOM.tag).
		// Рамка и прокрутка разведены по разным элементам: тогда отступы лежат внутри прокрутки,
		// и текст на концах уходит под них, а не обрывается по ним — как редактор в плашке.
		// Сама полоса от края отходит отступом из кита (--scrollbar-edge-inset), от разметки
		// это не зависит.
		const sourceTextElem = source
			? DOM.tag("pre", {
					class: [UIKIT.SCROLLABLE.CLASS, MESSAGEEDITOR.CLASS.ELEMENT.SOURCE_TEXT],
					tabindex: 0,
					dataset: { placeholder: placeholder ?? undefined },
				})
			: null;
		const sourceElem = sourceTextElem
			? DOM.tag("div", { class: MESSAGEEDITOR.CLASS.ELEMENT.SOURCE }, sourceTextElem)
			: null;

		const container = DOM.tag("div", { class: MESSAGEEDITOR.CLASS.ROOT }, [
			modes ? modes.elem : null,
			DOM.tag("div", { class: MESSAGEEDITOR.CLASS.ELEMENT.BUBBLE }, [inputElem, emojiHolder]),
			sourceElem,
		]);

		// скрыть поле, подменить tabindex и обернуть контейнером — общая механика базового класса
		MessageEditor.wrapValueElem(valueElem, container, MESSAGEEDITOR.CLASS.INPUT, inputElem, disabled);

		// класс и подменённый tabindex вернёт базовый класс при destroy
		super(
			"BrandUp.MessageEditor",
			container,
			valueElem,
			{ class: MESSAGEEDITOR.CLASS.INPUT, attrs: [["tabindex", tabIndexAttr]] },
			// каретку фокус из кода ставит в конец текста — режим по умолчанию
			{ changeEvent: MESSAGEEDITOR.EVENT.CHANGE }
		);

		this.placeholder = placeholder;
		// Переданный список проходит те же правила, что и разбор атрибута: ключ с символами
		// разметки не свернётся в цельную конструкцию, откуда бы он ни пришёл.
		this.variables = options.variables
			? cleanVariables(options.variables)
			: parseVariables(valueElem.dataset.variables);
		this.variablesEmpty = options.variablesEmpty ?? valueElem.dataset.variablesEmpty ?? null;
		this.variablesSetup = MessageEditor.parseSetup(
			options.variablesSetup ?? valueElem.dataset.variablesSetup ?? null
		);
		this.variablesSetupText =
			options.variablesSetupText ?? valueElem.dataset.variablesSetupText ?? MESSAGEEDITOR.TEXT.VARIABLES_SETUP;
		this.newVariables = options.newVariables ?? dataFlag(valueElem.dataset, "newVariables");
		// Объявленный список — тоже согласие: иначе переданные переменные молча никуда не вели бы.
		// Настройка полей — так же: объявленная, она обязана быть досягаемой, а живёт в окне.
		// Режим новых переменных — тоже: он про переменные и без них не значит ничего.
		this.personalization =
			options.personalization ??
			(dataFlag(valueElem.dataset, "personalization") ||
				!!this.variables.length ||
				!!this.variablesEmpty ||
				!!this.variablesSetup ||
				this.newVariables);
		this.blocks = options.blocks ?? parseBlockTypes(valueElem.dataset.blocks ?? null);
		this.tools = options.tools ?? parseFormatTools(valueElem.dataset.tools ?? null);
		// Все объявленные ключи, а не только названные: по этому же набору подсветка отличает
		// чужую переменную от известной. В тексте показываем название, если оно задано.
		this.__names = new Map(this.variables.map((v) => [v.key, v.name ?? null]));
		// Собирается один раз: ничего из этого после сборки не меняется, а подсветка идёт
		// на каждое нажатие — и дважды за проход, ранней проверкой и самой перестройкой.
		this.__highlightOptions = {
			variables: this.__names,
			enable: this.personalization,
			newVariables: this.newVariables,
		};
		this.__inputElem = inputElem;
		this.source = source;
		this.__sourceTextElem = sourceTextElem;
		// Негодная длина переменной — умолчание, а не ноль: Number("") и Number(" ") дают 0,
		// и пустой атрибут молча выключал бы поправку, которую никто не выключал. Дробная — тоже
		// негодная: длина считается в символах, и половина символа не бывает.
		const variableLengthAttr = valueElem.dataset.variableLength?.trim();
		const variableLength = options.variableLength ?? (variableLengthAttr ? Number(variableLengthAttr) : NaN);
		this.variableLength =
			Number.isInteger(variableLength) && variableLength >= 0
				? variableLength
				: MESSAGEEDITOR.VALUE.DEFAULT_VARIABLE_LENGTH;

		const editor = new RichEditor(inputElem, {
			placeholder,
			multiline: true,
			// Enter переносит строку, а не создаёт абзац: иначе каждое нажатие уходило бы
			// в значение пустой строкой. Абзац набирается двумя переносами, как в мессенджерах.
			paragraph: "break",
			// цитата и блок кода — объявленным набором: их понимает не каждый канал
			blocks: this.blocks,
			keepFocus: options.keepFocus,
			readonly,
			// disabled редактор знает сам: тот же запрет правок, что и readonly, плюс снятый
			// contenteditable — без фокуса и выделения
			disabled,
			// Форматирование включено всегда — даже с пустым набором инструментов и в disabled:
			// от него зависит и разбор значения (иначе вместо жирного показались бы звёздочки),
			// и история отмены. Кнопок при этом не появится: их снимает readonly, а в disabled
			// он тоже стоит.
			format: true,
			// разметка объявленным набором: понимает её не каждый канал
			tools: this.tools,
			// Очистка формата: снять разметку разом нужнее всего там, где текст приносят вставкой.
			// Без единого инструмента снимать нечего — кнопки тогда нет вовсе. Отмену и повтор
			// не выводим (на них есть привычные сочетания), смайлик — тоже: для него своя кнопка
			// рядом с плашкой, доступная и без фокуса в поле.
			actions: this.tools.length ? ["erase"] : [],
			// доменные кнопки: редактор про рандомизацию и переменные не знает, только рисует их
			buttons: disabled ? [] : this.__toolbarButtons(),
			// значение хранится разметкой мессенджеров, а не HTML
			storage: STORAGE,
			// панель показывается над плашкой, а не над document.body
			toolbarContainer: container,
			value: valueElem.value,
			// onEnter здесь не нужен: он про однострочный режим, а сообщение всегда многострочное —
			// Enter переносит строку и форму не отправляет
		});
		this.__attachEditor(editor);

		this.__initLogic();
		if (emojiElem && emojiHolder) this.__initEmoji(emojiElem, emojiHolder);
		if (modes) this.__initModes(modes.elem, modes.buttons);

		this.__highlight(); // начальное значение события change не поднимает

		// Носитель приводим к содержимому редактора после подсветки: она подменяет написанные
		// названия переменных ключами (см. __mapNames), и в форму значение обязано уйти с ключами.
		this.__valueElem.value = this.__messageValue();

		// Начальное значение события изменения не поднимает, а проверить его надо: разметку
		// с чужой переменной отдаёт сервер, и до первой правки поля подписи невалидности не было
		// бы вовсе — форма ушла бы с переменной, которую нечем подставить (нативная проверка
		// ограничений идёт до события submit, и синхронизация в нём опаздывает).
		this.__refreshValidity();

		this.__applyAutoFocus(); // автофокус — вместе с прокруткой к плашке; условия у базового класса
	}

	/**
	 * Разбирает объявленную настройку полей: действие хоста берётся как есть, адрес — только
	 * годный.
	 *
	 * Адрес уходит в `href`, а `javascript:` там — исполнение кода, пришедшего вместе с разметкой
	 * (см. safeUrl в @brandup/ui-richeditor); окно проверяет его ещё раз у самой записи в DOM,
	 * но решение «есть ли настройка вообще» принимается здесь: от него зависит и включение
	 * персонализации. Негодный адрес — как необъявленная настройка: строки в окне не будет вовсе.
	 * Про потерю говорим в консоль: молча пропавшая ссылка выглядит как «её забыли объявить».
	 *
	 * Адрес из одних пробелов объявлением не считается: он никуда не ведёт, а раньше проходил
	 * мимо проверки (`trim` пустой — значит и проверять нечего) и давал в окне мёртвую строку,
	 * заодно включая персонализацию.
	 *
	 * Статический, потому что зовётся из конструктора — до того, как поля объявлены.
	 */
	private static parseSetup(
		declared: string | (() => void | boolean) | null
	): string | (() => void | boolean) | null {
		if (typeof declared !== "string") return declared;

		const url = safeUrl(declared);
		if (url) return url;

		// про пустое не сообщаем: объявить настройку пустой строкой — то же, что не объявить
		if (declared.trim()) console.error("MessageEditor: настройка полей отброшена — негодный адрес.", declared);

		return null;
	}

	private __initLogic() {
		const { signal } = this.__listenerAbort;
		const editable = this.__inputElem;

		this.__editor.onChange((data) => {
			// Подсветка идёт до записи значения: она подменяет написанные названия переменных
			// ключами (см. __mapNames), и записанное раньше неё ушло бы хосту названием, которого
			// в поле уже нет. Пересчитываем значение только тогда, когда подмена что-то нашла:
			// сериализация недешёвая, а меняет текст она редко.
			//
			// Destroying the editor flushes the deferred change: the host must still get the value,
			// but rebuilding the highlight is pointless — the field is going away, and moving the
			// caret inside it even more so.
			const remapped = !this.__disposing && this.__highlight();

			this.__valueElem.value = remapped ? this.__messageValue() : withoutAnchors(data.value);

			// Значение перечитываем у поля-носителя, а не берём записанное: браузер приводит его
			// по типу поля — input, например, срезает переносы строк, — и хост обязан получить
			// ровно то, что отдадут getValue() и форма. Чтение дешёвое: это то же поле, куда
			// значение только что записали, а не ещё одна синхронизация с редактором.
			const value = this.__valueElem.value;

			// Показанный выход следует за значением: пока панель открыта, менять его может
			// и хост через setValue, и окно правки, открытое до переключения.
			if (!this.__disposing && this.sourceMode) this.__renderSource();

			// Подпись невалидности следует за значением — ровно одной проверкой на изменение.
			// Помеченное невалидным поле перепроверяем целиком: validate() освежает подпись сам
			// (через __syncValue) и переключает класс в обе стороны. Пока класса нет, снимать
			// нечего — хватает самой подписи.
			if (this.element.classList.contains(MESSAGEEDITOR.CLASS.STATE.INVALID)) this.validate();
			else this.__refreshValidity();

			// значение уже посчитано — читать его заново (ещё один __syncValue) незачем
			this.trigger(MESSAGEEDITOR.EVENT.CHANGE, <ChangeEventData>{ editor: this, value: value.trim() });
		});

		// Подсветка — на каждый ввод, а не только по change: событие изменения при печати
		// троттлится, а конструкция должна подсвечиваться сразу, как дописана закрывающая скобка.
		// Сама highlight() дёшево выходит, когда ни конструкций, ни прежних обёрток нет.
		editable.addEventListener("input", () => this.__highlight(), { signal });

		// Клик мимо текста — тоже клик по полю: плашка выглядит и ведёт себя как одно поле ввода,
		// а её поля и место справа от текста в редактируемый элемент не входят.
		this.element.addEventListener("mousedown", (e) => this.__focusFromBubble(e), { signal });

		// стирание конструкций — до нативного удаления: рядом с ними оно ненадёжно (см. __deleteMarkup)
		editable.addEventListener("keydown", (e) => this.__deleteMarkup(e), { signal });

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
	}

	/**
	 * Значение редактора без опор каретки: подсветка ставит их за конструкциями, которыми
	 * кончается строка (см. MESSAGEEDITOR.SYNTAX.CARET_ANCHOR в ./highlight), а сообщению они не нужны — их там
	 * никто не набирал.
	 */
	private __messageValue(): string {
		return withoutAnchors(this.__editor.getValue());
	}

	/**
	 * Есть ли по чему отличать объявленную переменную от чужой. Отличать не по чему только тогда,
	 * когда персонализация выключена: `{ИМЯ}` там обычный текст, и переменных в поле нет вовсе.
	 *
	 * Пустой список этому не мешает: он значит, что не объявлено ничего, — и чужой становится любая
	 * переменная (см. isUnknown в ./highlight). Приложение, которому набор ещё не известен, включает
	 * персонализацию тогда же, когда узнаёт набор. В режиме новых переменных пустой список — рабочее
	 * начало: переменные и заводятся по мере того, как их набирают.
	 */
	private get __knowsVariables(): boolean {
		return this.personalization;
	}

	/**
	 * Останавливает ли необъявленная переменная отправку формы: в режиме новых переменных нет —
	 * там она заявка, а не ошибка, и заведёт её приложение.
	 *
	 * Он же признак того, что подпись невалидности на поле наша: пока проверять не по чему,
	 * поле не трогаем вовсе — стёрли бы чужую, выставленную приложением.
	 */
	private get __checksVariables(): boolean {
		return this.__knowsVariables && !this.newVariables;
	}

	/**
	 * Ключи переменных из текста, которых нет в объявленном списке, — в порядке появления.
	 *
	 * В строгом режиме приложению это нужно, чтобы объяснить, что не так: подсветка показывает
	 * место, а сообщение рядом с полем — что делать. В режиме новых переменных это список того,
	 * что предстоит завести: отправку он не держит, но кто-то должен его выполнить.
	 */
	get unknownVariables(): string[] {
		if (!this.__knowsVariables) return [];

		return findUnknownVariables(this.__inputElem, this.__names, this.newVariables);
	}

	/**
	 * Неизвестная переменная — ошибка значения, а не оформления: подставить её нечем, и получателю
	 * она уйдёт скобками наружу. Объявляем полю-носителю через setCustomValidity, как textbox
	 * объявляет свой лимит длины: дальше решает браузер — он же блокирует отправку формы.
	 *
	 * В режиме новых переменных проверки нет вовсе: необъявленный ключ там ожидаем, и подпись
	 * поля остаётся приложению.
	 */
	protected override __refreshValidity(): void {
		if (!this.__checksVariables) return;

		const unknown = this.unknownVariables;
		this.__valueElem.setCustomValidity(
			unknown.length ? `Неизвестные переменные: ${unknown.map(buildVariable).join(", ")}.` : ""
		);
	}

	/**
	 * Длина сообщения с поправкой на конструкции: спинтакс считается самым длинным вариантом
	 * (в отправку уйдёт один из них, и лимит обязан выдержать любой), переменная — условной
	 * длиной подставляемого значения ({@link variableLength}). Без персонализации `{ИМЯ}` —
	 * обычный текст и считается по буквам, ровно как показывается.
	 *
	 * Считается на месте, по текущему содержимому: свой лимит канала хост проверяет сам.
	 */
	get messageLength(): number {
		return countLength(this.__inputElem, {
			enable: this.personalization,
			variableLength: this.variableLength,
		});
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
		// в режиме выхода плашки на экране нет вовсе: клик по корню — это клик по панели, и текст
		// в ней выделяют, а не правят
		if (this.disabled || this.sourceMode) return;

		const target = e.target as HTMLElement | null;
		if (!target || this.__inputElem.contains(target)) return; // в сам текст браузер попадёт и сам

		// своя кнопка, панель форматирования и её попапы живут внутри плашки и работают сами
		if (
			target.closest(
				`button, a, input, textarea, select, .${RICHEDITOR.CLASS.TOOLBAR.ROOT}, .${UIKIT.POPUP.CLASS.ROOT}`
			)
		)
			return;

		e.preventDefault();
		this.__editor.focus(true);
	}

	/**
	 * Подсветка спинтакса и переменных. Сама подсветка текст не меняет, поэтому каретка
	 * восстанавливается по смещениям точно; возвращаем её всякий раз, когда разметку
	 * перестраивали, — обёртки собираются заново, и старое выделение указывало бы в никуда.
	 *
	 * Возвращает true, если текст поля всё же изменился — написанное название переменной стало
	 * ключом (см. {@link __mapNames}): посчитанное до этого значение разошлось бы с полем.
	 *
	 * Во время IME-композиции не вмешиваемся: перестановка каретки прервала бы набор.
	 */
	private __highlight(): boolean {
		if (this.__composing) return false;

		const options = this.__highlightOptions;

		// Снимок каретки для preserveCaret не бесплатен: он считает смещения обходом содержимого,
		// и на обычном наборе — где ни конструкций, ни обёрток нет — доставался бы зря на каждый
		// ввод. Поэтому дешёвая проверка идёт до снимка, а не только внутри highlight().
		if (!mayHaveMarkup(this.__inputElem, options)) return false;

		// Конструкция, разорванная инлайновой разметкой (`{` перед жирным словом и `}` после),
		// не находится ни подменой названий, ни подсветкой — обе идут по текстовым узлам.
		// Склеиваем до них: дальше это обычная конструкция в одном узле.
		preserveCaret(this.__inputElem, () => joinSplitMarkup(this.__inputElem, options));

		// Название вместо ключа подменяем до подсветки: она обязана сохранять текст — по нему
		// возвращается каретка, — а подмена его меняет.
		const mapped = this.__mapNames();

		preserveCaret(this.__inputElem, () => highlight(this.__inputElem, options));

		this.__escapeMarkup();

		return mapped;
	}

	/**
	 * Приводит написанное название переменной к её ключу (см. {@link mapVariableNames}).
	 * Возвращает true, если текст поля изменился.
	 *
	 * Пока отличать не по чему, не трогаем ничего: без персонализации `{ИМЯ}` — обычный текст,
	 * а без объявленных названий подменять нечего (см. {@link mapVariableNames}). Во время
	 * IME-композиции — тоже: подмена под набором прервала бы его.
	 */
	private __mapNames(): boolean {
		if (this.__composing || !this.__knowsVariables) return false;

		return mapVariableNames(this.__inputElem, this.__names, this.newVariables);
	}

	/**
	 * Backspace и Delete у конструкции стирают её целиком.
	 *
	 * Конструкция неделима — стереть в ней символ нельзя, — а нативное удаление рядом с
	 * нередактируемым элементом браузеры делают по-разному: где-то он сперва выделяется, где-то
	 * исчезает разом. Вдобавок за конструкцией в конце строки стоит невидимая опора каретки
	 * (см. MESSAGEEDITOR.SYNTAX.CARET_ANCHOR), и нажатие уходило бы на неё: опору тут же возвращает подсветка, и
	 * набранную с клавиатуры переменную не получалось бы стереть вовсе.
	 *
	 * Удаление словами и строками (Ctrl, Alt, Cmd) оставляем браузеру: это правка текста вокруг,
	 * а не самой конструкции.
	 */
	private __deleteMarkup(e: KeyboardEvent) {
		if (e.defaultPrevented || this.disabled || this.readonly || this.__composing) return;

		const back = e.key === "Backspace";
		if ((!back && e.key !== "Delete") || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

		const selection = this.__editor.selection;
		if (!selection) return;

		const span = markupBeside(this.__inputElem, selection, back);
		if (!span) return;

		e.preventDefault();

		// вместе с конструкцией уходит и её опора: держать место больше не за чем
		const anchor = anchorAfter(span);
		this.__editor.deleteNodes(anchor ? [span, anchor] : [span]);
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
		// без персонализации переменные и не подсвечиваются, но проверка дешевле, чем догадка
		if (span.classList.contains(MESSAGEEDITOR.CLASS.MARKUP.VARIABLE) && !this.personalization) return;

		this.__openModal(this.__markupModal(span), span);
	}

	/**
	 * Каким окном правят конструкцию: спинтакс — рандомизацией, объявленную переменную — списком.
	 *
	 * Необъявленную в режиме новых переменных — правкой ключа: в списке её нет и быть не может,
	 * её набрали здесь же, и опечатку в ней исправляют текстом, а не выбором. В строгом режиме
	 * необъявленная — ошибка, и список там ровно то, что нужно: исправить её можно только
	 * объявленной переменной.
	 */
	private __markupModal(span: HTMLElement): (apply: (text: string) => void) => Modal {
		const text = span.textContent ?? "";

		if (!span.classList.contains(MESSAGEEDITOR.CLASS.MARKUP.VARIABLE))
			return (apply) => new RandomizerModal(text, apply);

		const declared =
			!span.classList.contains(MESSAGEEDITOR.CLASS.MARKUP.NEW) &&
			!span.classList.contains(MESSAGEEDITOR.CLASS.MARKUP.UNKNOWN);
		if (this.newVariables && !declared) return (apply) => new VariableKeyModal(text, apply);

		return this.__variablesModal;
	}

	/**
	 * Фабрика окна персонализации: окно одно и то же, а открывают его и кнопка панели, и клик
	 * по конструкции. Стрелка, а не метод: фабрика передаётся в {@link __openModal} как есть.
	 *
	 * Новые переменные берутся из текста на каждое открытие: набранная только что должна найтись
	 * в списке сразу, а собранный однажды список отставал бы от поля.
	 */
	private __variablesModal = (apply: (text: string) => void): Modal =>
		new VariablesModal(
			this.variables,
			apply,
			this.variablesEmpty,
			this.__variablesSetup(),
			this.newVariables ? this.unknownVariables : null
		);

	/**
	 * Ссылка на настройку полей для окна переменных — поведение нажатия собирается здесь:
	 * окну отдаются только подпись, адрес и готовый обработчик.
	 *
	 * Окно закрывается молча (см. {@link __closeModal}) — фокус уходит на другой экран, и
	 * возвращать каретку в поле незачем. С адресом переход остаётся штатным переходом ссылки;
	 * функция хоста возвращает `false`, когда окно должно остаться открытым, — по умолчанию
	 * закрывается.
	 */
	private __variablesSetup(): VariablesSetup | null {
		const setup = this.variablesSetup;
		if (!setup) return null;

		const text = this.variablesSetupText;
		if (typeof setup === "string") return { text, url: setup, onClick: () => this.__closeModal() };

		return {
			text,
			onClick: () => {
				// сперва действие, потом закрытие: ответ «оставить открытым» знает только хост
				const keep = setup() === false;
				if (!keep) this.__closeModal();
			},
		};
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
	private __openModal(
		create: (apply: (text: string) => void) => Modal,
		replace?: HTMLElement,
		/**
		 * Считать ли целью правки слово под кареткой. Окно рандомизации берёт его первым
		 * вариантом, когда своего выделения нет, — и собранный спинтакс должен встать на место
		 * этого слова, а не разорвать его пополам. Правки готовой конструкции это не касается:
		 * там место задано узлом.
		 */
		useCaretWord = false
	) {
		// до releaseFocus: он снимает выделение, и слово по каретке уже не найти
		const word = !replace && useCaretWord ? this.__editor.caretWord : "";
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

			// выделяем то, что заменяем, — insertText заменит выделенное
			if (replace) this.__editor.selectNode(replace);
			else if (word) this.__editor.selectCaretWord();

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
			// Если компонент снимают или окно закрывают из кода, возвращать её некуда и незачем:
			// поля сейчас не станет либо его никто не просил (см. __closeModal).
			if (!this.__disposing && !this.__modalSilent && !applied && caret) {
				this.__editor.restoreCaret(caret);
				this.__escapeMarkup();
			}

			// снимаем удержание последним: фокус уже в поле, и содержимое трогать рано
			release();
		});
	}

	/**
	 * Закрывает открытое окно правки без возврата каретки и фокуса в поле.
	 *
	 * Закрытие кнопкой или Esc — это конец правки: фокус возвращается туда, откуда его забрали.
	 * А закрывают окно и из кода (см. {@link setValue} и {@link destroy}), где о фокусе никто
	 * не просил: программная замена значения не должна уводить фокус со страницы в поле
	 * и поднимать на сенсорном устройстве экранную клавиатуру.
	 */
	private __closeModal() {
		if (!this.__modal) return;

		this.__modalSilent = true;
		try {
			this.__modal.close();
		} finally {
			this.__modalSilent = false;
		}
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
						run: () => this.__openModal(this.__variablesModal),
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
					// Без своего выделения источником становится слово под кареткой: рандомизируют
					// чаще всего то слово, на котором стоят, и набирать его в окне заново незачем.
					// Собранный спинтакс встанет на его место — за это отвечает третий аргумент.
					const word = selected ? "" : this.__editor.caretWord;
					this.__openModal((apply) => new RandomizerModal(selected || word, apply), undefined, !!word);
				},
			},
			...personalization,
		];
	}

	private __initEmoji(button: HTMLElement, container: HTMLElement) {
		const { signal } = this.__listenerAbort;

		// кнопка не забирает фокус — иначе редактор потеряет каретку, а вместе с ней и место вставки
		keepEditorFocus(button, signal);
		button.addEventListener(
			"click",
			(e) => {
				if (this.disabled || this.readonly) return;

				// без этого PopupManager получит тот же клик своим слушателем на body и закроет панель
				e.stopPropagation();

				// Попап свой, а не панели форматирования: он раскрывается от кнопки в плашке, живёт
				// в её коробке и панели не принадлежит. Собирает его редактор, показывает — тоже он:
				// каретку и удержание правки на время попапа знает только он.
				this.__emojiPicker ??= createEmojiPicker((emoji) => this.__editor.insertText(emoji));
				if (this.__emojiPicker.parentElement !== container) container.appendChild(this.__emojiPicker);

				this.__editor.openEmojiPicker(this.__emojiPicker, button);
			},
			{ signal }
		);
	}

	private __initModes(modes: HTMLElement, buttons: HTMLButtonElement[]) {
		const { signal } = this.__listenerAbort;

		this.__modeButtons = buttons;

		// Кнопки не забирают фокус нажатием: из плашки его уводит уже само переключение, а
		// возвращаться туда после показа выхода нужно к прежней каретке, а не в конец текста.
		keepEditorFocus(modes, signal);

		modes.addEventListener(
			"click",
			(e) => {
				const button = (e.target as HTMLElement).closest<HTMLElement>(`.${MESSAGEEDITOR.CLASS.ELEMENT.MODE}`);
				// нажали в самом поле — продолжают работать в нём: фокус возвращается в плашку
				if (button) this.__toggleSource(button.dataset.mode === "source", true);
			},
			{ signal }
		);

		this.__refreshModes();
	}

	/** Отмечает в переключателе показанный режим. */
	private __refreshModes() {
		for (const button of this.__modeButtons) {
			const active = (button.dataset.mode === "source") === this.sourceMode;

			button.classList.toggle(MESSAGEEDITOR.CLASS.STATE.ACTIVE, active);
			button.setAttribute("aria-pressed", active ? "true" : "false");
		}
	}

	/**
	 * Рендерит выход в панель — ровно тем текстом, который сейчас лежит в поле-носителе.
	 * Только чтение: отложенное изменение доставляет {@link __toggleSource} до переключения,
	 * а из обработчика изменения сюда приходят уже с доставленным.
	 */
	private __renderSource() {
		// без включённого показа панели нет вовсе — рендерить некуда
		if (!this.__sourceTextElem) return;

		this.__sourceTextElem.textContent = this.__valueElem.value;
	}

	/**
	 * Показан ли выход вместо плашки.
	 *
	 * Режим держит своё поле, а не класс на корневом элементе: собственные классы поля-носителя
	 * переезжают на корневой элемент контрола (см. `prepareValueElem` в `@brandup/ui-input`),
	 * и `class="source-mode"` в разметке поля включал бы режим, которого нет, — с панелью, которую
	 * никто не собирал. Класс при этом остаётся и выставляется переключением, как focused
	 * и invalid: он контракт оформления, но читают его стили, а не компонент.
	 */
	get sourceMode(): boolean {
		return this.__sourceMode;
	}

	/**
	 * Переключает режим показа: плашка с сообщением или его выход в формате хранения. Значение
	 * от переключения не меняется — панель только показывает то, что уже лежит в поле-носителе.
	 *
	 * Фокус по умолчанию не переводится: переключает и хост из кода, а программное переключение
	 * не должно уводить фокус со страницы и поднимать экранную клавиатуру. Сама кнопка
	 * переключателя фокус в плашку возвращает — нажали в поле, значит продолжают писать; хост
	 * просит того же вторым аргументом.
	 *
	 * Без включённого показа выхода не делает ничего: панели, в которую рендерить, нет.
	 *
	 * @param show Показать выход; без аргумента — переключить на противоположный режим.
	 * @param focus Вернуть ли фокус в плашку при возврате к сообщению. В disabled и readonly
	 * фокус не ставится и по просьбе: в readonly он выделяет всё сообщение (так работает
	 * редактор), и смена вида делала бы то же самое.
	 */
	toggleSource(show = !this.sourceMode, focus = false): void {
		this.__toggleSource(show, focus);
	}

	/**
	 * Само переключение; `focus` — вернуть ли фокус в плашку при возврате к сообщению.
	 * Кнопка переключателя передаёт true всегда: нажали в поле — значит, продолжают писать.
	 */
	private __toggleSource(show: boolean, focus: boolean): void {
		if (!this.source || show === this.__sourceMode) return;

		// Переключение не должно начаться заново изнутри себя: __syncValue ниже доставляет
		// отложенное изменение синхронно, и обработчик хоста, переключающий режим из него,
		// прошёл бы проверку выше (режим ещё прежний) и проделал бы второе переключение —
		// со вторым снятием всплывающих слоёв и второй перерисовкой панели.
		if (this.__switching) return;
		this.__switching = true;

		try {
			this.__switch(show, focus);
		} finally {
			this.__switching = false;
		}
	}

	/** Само переключение, уже под защитой от повторного входа (см. {@link __toggleSource}). */
	private __switch(show: boolean, focus: boolean): void {
		if (show) {
			// Отложенное изменение доставляем до переключения: панель обязана показать актуальное
			// значение, а доставка после смены режима рендерила бы её дважды — из обработчика
			// изменения и здесь. Через __syncValue, а не голый flushChange: значение читается
			// наружу, и проверка переменных обязана пройти, как при любом таком чтении.
			this.__syncValue();

			// Фокус отпускаем до скрытия плашки: releaseFocus снимает каретку с живого выделения,
			// а у спрятанной плашки браузер его уже схлопнул бы — фокус вернулся бы не туда.
			// С клавиатуры (Enter по кнопке режима) поле и так не в фокусе — снимать нечего, и
			// каретка переключение не переживает; чинить это здесь нечем: снимка без фокуса нет.
			this.__editor.releaseFocus();

			// Всплывающие слои плашки уходят вместе с ней. Панель форматирования снимается и по
			// blur, но правку адреса ссылки blur не прерывает: фокус в это время в самой панели,
			// и до редактора он не доходил. Попап смайликов закрывает и PopupManager — тем же
			// кликом, что пришёл на кнопку, — но режим переключает и хост из кода, а оставленный
			// открытым попап держал бы PopupManager на невидимом элементе: на body остался бы его
			// класс, и на узком экране страница перестала бы прокручиваться.
			formatToolbar.detach(this.__editor);
			if (this.__emojiPicker) PopupManager.close(this.__emojiPicker);

			// Режим — своё поле, класс на элементе только оформляет его (см. sourceMode)
			this.__sourceMode = true;
			this.element.classList.add(MESSAGEEDITOR.CLASS.STATE.SOURCE_MODE);
			this.__renderSource();
		} else {
			this.__sourceMode = false;
			this.element.classList.remove(MESSAGEEDITOR.CLASS.STATE.SOURCE_MODE);

			// Вернулись к сообщению кнопкой — продолжают писать: фокус идёт следом, на прежнее
			// место, а если каретки ещё не было — в конец текста. В readonly не фокусируем:
			// фокус там выделяет всё сообщение, и переключение показа делало бы то же.
			if (focus && !this.disabled && !this.readonly) this.__editor.focus(true);
		}

		this.__refreshModes();
	}

	/** Доступ к встроенному редактору (выделение, вставка текста и т.п.). */
	get editor(): RichEditor {
		return this.__editor;
	}

	override setValue(value: string): void {
		// Открытое окно правки закрываем: новое значение пересоберёт содержимое, и заменяемая
		// окном конструкция осталась бы указывать на снятые узлы — применение вставило бы дубликат.
		// Молча: значение меняют из кода, и фокус с кареткой возвращать в поле никто не просил.
		this.__closeModal();

		super.setValue(value); // редактор нормализует значение, поднимет change и обновит носитель
	}

	override destroy(): void {
		// Придти сюда могут дважды: снял хост, а следом сработало авто-уничтожение по удалению
		// элемента из DOM (UIElement подписан на MutationObserver) — или наоборот. Второй проход
		// обращался бы к уже снятому элементу и падал бы на возврате поля-носителя, не дойдя
		// до снятия своей подписи невалидности ниже, — и поле осталось бы в форме невалидным.
		if (this.__disposing) return;
		this.__disposing = true;

		// Окно правки живёт в body, а не внутри компонента: само оно не исчезнет, а его кнопки
		// правили бы уже снятый редактор. Закрываем до него — обработчику закрытия нужен живой.
		this.__closeModal();

		super.destroy(); // снимет редактор и слушатели формы, вернёт поле-носитель в исходный вид

		// Своя подпись невалидности контрол переживёт: поле вернётся в форму обычным, но
		// навсегда невалидным, а понять почему будет нечем — плашки с подсветкой уже нет.
		// Снимаем последней: разрушение редактора доставляет отложенное изменение, а оно
		// проходит через __refreshValidity и подпись бы вернуло.
		if (this.__checksVariables) this.__valueElem.setCustomValidity("");
	}
}

export interface ChangeEventData {
	editor: MessageEditor;
	value: string;
}
