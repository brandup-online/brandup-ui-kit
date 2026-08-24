import "./variables.less"; // стили окна

import { DOM } from "@brandup/ui";
import { Modal, textTag } from "@brandup/ui-kit";
import { MESSAGEEDITOR } from "./names";

/** Переменная персонализации: подставляется приложением при отправке. */
export interface MessageVariable {
	/** Ключ внутри фигурных скобок, например `ИМЯ`. Он и уходит в значение сообщения. */
	key: string;
	/** Название: показывается вместо ключа и в тексте, и в списке. Без него виден ключ. */
	name?: string;
}

/**
 * Ссылка на настройку полей — последней строкой окна. Где настройка живёт, знает хост:
 * с адресом рисуется настоящая `<a href>` (работают средняя кнопка и «копировать адрес»),
 * без него — кнопка в виде ссылки, а само действие делает {@link onClick}.
 */
export interface VariablesSetup {
	/** Подпись ссылки. */
	text: string;
	/** Адрес перехода; без него рисуется кнопка, а не ссылка. */
	url?: string;
	/** Нажатие: у ссылки — вдогонку переходу (закрыть окно), у кнопки — само действие. */
	onClick(): void;
}

/** Выбор переменной персонализации из списка; выбранная вставляется как `{ИМЯ}`. */
export default class VariablesModal extends Modal {
	private readonly __variables: MessageVariable[];
	private readonly __newKeys: string[];
	private readonly __apply: (text: string) => void;
	private readonly __emptyText: string;
	private readonly __setup: VariablesSetup | null;

	override get typeName(): string {
		return "BrandUp.MessageEditor.Variables";
	}

	/**
	 * @param newKeys Ключи из текста, которых нет в объявленном списке: показываются теми же
	 * записями следом за объявленными, но с пометкой — набраны они в сообщении, а заведёт их
	 * приложение. Список пуст, пока режим новых переменных выключен.
	 */
	constructor(
		variables: MessageVariable[],
		apply: (text: string) => void,
		emptyText?: string | null,
		setup?: VariablesSetup | null,
		newKeys?: string[] | null
	) {
		super({ title: MESSAGEEDITOR.TEXT.VARIABLES_TITLE, className: MESSAGEEDITOR.CLASS.MODAL.ROOT.VARIABLES });

		this.__variables = variables;
		// Объявленный ключ, случайно попавший сюда, дал бы в списке две записи об одном поле.
		this.__newKeys = (newKeys ?? []).filter(
			(key) => !variables.some((v) => plainVariableKey(v.key) === plainVariableKey(key))
		);
		this.__apply = apply;
		this.__emptyText = emptyText?.trim() || MESSAGEEDITOR.TEXT.VARIABLES_EMPTY;
		this.__setup = setup ?? null;

		this.registerCommand(MESSAGEEDITOR.COMMAND.VARIABLES.PICK, (context) => {
			const key = context.target.dataset.variable;
			if (!key) return;

			this.__apply(buildVariable(key));
			this.close();
		});

		this.__renderList();
		this.__renderSetup();
	}

	private __renderList() {
		const list = DOM.tag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.VARIABLES });
		this.body.appendChild(list);

		// the hint, names and keys are host data (options or attributes of the value element) —
		// they go in as text, never as markup (see textTag)
		if (!this.__variables.length && !this.__newKeys.length) {
			list.appendChild(textTag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.EMPTY }, this.__emptyText));
			return;
		}

		this.__variables.forEach((variable) => list.appendChild(this.__renderVariable(variable)));

		// Новые — следом за объявленными и одним с ними списком: вставляются они одинаково,
		// и разводить их по разделам значило бы делать из пометки раздел. Порядок при этом
		// свой: объявленные — то, что заведено, новые — то, что ещё предстоит завести.
		this.__newKeys.forEach((key) => list.appendChild(this.__renderVariable({ key }, true)));
	}

	/**
	 * Запись списка. Сначала — как переменная будет выглядеть в сообщении, следом ключ: выбирают
	 * по виду, а ключ лишь уточняет, что уйдёт в текст. Без названия показывать ключ дважды
	 * незачем — вид и есть ключ.
	 *
	 * У новой переменной названия нет вовсе (в списке её нет, брать неоткуда), а место ключа
	 * занимает пометка: она объясняет и другой цвет такой переменной в тексте.
	 */
	private __renderVariable(variable: MessageVariable, isNew = false): HTMLElement {
		return DOM.tag(
			"button",
			{
				type: "button",
				class: isNew ? "variable new" : "variable",
				command: MESSAGEEDITOR.COMMAND.VARIABLES.PICK,
				dataset: { variable: variable.key },
			},
			[
				textTag(
					"span",
					{ class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.PREVIEW },
					buildVariable(variable.name ?? variable.key)
				),
				// ключ без скобок: он не образец для вставки, а пометка — что именно уйдёт в текст
				isNew
					? textTag(
							"span",
							{ class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.NOTE },
							MESSAGEEDITOR.TEXT.VARIABLE_NEW
						)
					: variable.name
						? textTag("span", { class: "key" }, variable.key)
						: null,
			]
		);
	}

	/**
	 * Ссылка на настройку полей — последней строкой окна, в обоих состояниях списка одинаково:
	 * при пустом это главный выход («переменные не заданы» → настроить), при заполненном —
	 * запасной, когда нужного поля в списке не нашлось. Одно место — ссылка не прыгает по окну.
	 * Без объявленной настройки строки нет вовсе: мёртвый элемент хуже отсутствующего.
	 */
	private __renderSetup() {
		if (!this.__setup) return;
		const { text, url, onClick } = this.__setup;

		// Подпись — данные хоста: в окно она идёт текстом, не разметкой (см. textTag).
		// У ссылки переход остаётся штатным — обработчик его не гасит, он лишь закрывает окно.
		const link = url
			? textTag("a", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.SETUP_LINK, href: url }, text)
			: textTag("button", { type: "button", class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.SETUP_LINK }, text);
		link.addEventListener("click", () => onClick());

		this.body.appendChild(DOM.tag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.SETUP }, link));
	}
}

/** Оборачивает ключ (или показываемое вместо него название) в разметку переменной. */
export function buildVariable(key: string): string {
	return `${MESSAGEEDITOR.SYNTAX.VARIABLE_OPEN}${key}${MESSAGEEDITOR.SYNTAX.VARIABLE_CLOSE}`;
}

/**
 * Ключ из готовой конструкции — обратная к {@link buildVariable}: `{ИМЯ}` даёт `ИМЯ`.
 * Не конструкция возвращается как есть: окно правки открывают и по тексту, набранному руками.
 */
export function parseVariable(text: string): string {
	const value = text.trim();

	return value.length > MESSAGEEDITOR.SYNTAX.VARIABLE_OPEN.length + MESSAGEEDITOR.SYNTAX.VARIABLE_CLOSE.length &&
		value.startsWith(MESSAGEEDITOR.SYNTAX.VARIABLE_OPEN) &&
		value.endsWith(MESSAGEEDITOR.SYNTAX.VARIABLE_CLOSE)
		? value.slice(MESSAGEEDITOR.SYNTAX.VARIABLE_OPEN.length, -MESSAGEEDITOR.SYNTAX.VARIABLE_CLOSE.length)
		: value;
}

/**
 * Правка ключа новой переменной.
 *
 * Объявленную выбирают из списка, а новую там взять неоткуда: её набрали здесь же — значит
 * и правят её текстом. Окно, а не правка прямо в поле: конструкция в тексте неделима (каретке
 * внутри неё места нет), и разделять её ради опечатки значило бы менять всю механику каретки.
 *
 * Символы разметки в поле не набираются и не вставляются — с ними ключ перестал бы быть
 * цельной конструкцией. Те же правила, что и у списка переменных (см. {@link isVariableKey}):
 * сохранить нельзя то, что нельзя объявить.
 */
export class VariableKeyModal extends Modal {
	private readonly __apply: (text: string) => void;
	private readonly __field: HTMLInputElement;
	private readonly __applyButton: HTMLButtonElement;

	override get typeName(): string {
		return "BrandUp.MessageEditor.VariableKey";
	}

	/**
	 * @param text Текст конструкции целиком (`{КЛЮЧ}`) — как и у окна рандомизации.
	 * @param apply Вызывается с готовой конструкцией; при отмене не вызывается.
	 */
	constructor(text: string, apply: (text: string) => void) {
		super({ title: MESSAGEEDITOR.TEXT.VARIABLES_TITLE, className: MESSAGEEDITOR.CLASS.MODAL.ROOT.VARIABLE_KEY });

		this.__apply = apply;

		// Поле ввода, а не редактируемая область: ключ короткий и всегда в одну строку —
		// переносить в нём нечего, а поле ввода само не даст набрать перенос.
		this.__field = DOM.tag("input", {
			type: "text",
			class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.KEY_FIELD,
			placeholder: "Ключ переменной",
			autocomplete: "off",
			spellcheck: false,
		}) as HTMLInputElement;
		// значением, а не атрибутом: ключ приходит из сообщения — в DOM он идёт текстом
		this.__field.value = parseVariable(text);

		this.__applyButton = DOM.tag(
			"button",
			{
				type: "button",
				class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.APPLY,
				command: MESSAGEEDITOR.COMMAND.VARIABLE_KEY.APPLY,
			},
			"Сохранить"
		) as HTMLButtonElement;

		this.__field.addEventListener("input", () => this.__clean());
		this.__field.addEventListener("keydown", (e) => {
			// Enter — то же сохранение: в поле из одной строки ему больше нечего делать
			if (e.key !== "Enter") return;

			e.preventDefault();
			this.__save();
		});

		this.body.appendChild(DOM.tag("div", { class: "key" }, this.__field));
		this.body.appendChild(
			textTag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.HINT }, MESSAGEEDITOR.TEXT.VARIABLE_KEY_HINT)
		);
		this.body.appendChild(
			// сохранение первым: это главное действие окна, отмена рядом вторым
			DOM.tag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.ACTIONS }, [
				this.__applyButton,
				DOM.tag(
					"button",
					{
						type: "button",
						class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.CANCEL,
						command: MESSAGEEDITOR.COMMAND.VARIABLE_KEY.CANCEL,
					},
					"Отмена"
				),
			])
		);

		this.registerCommand(MESSAGEEDITOR.COMMAND.VARIABLE_KEY.APPLY, () => this.__save());
		this.registerCommand(MESSAGEEDITOR.COMMAND.VARIABLE_KEY.CANCEL, () => this.close());

		this.__refresh();

		// Окно открыли, чтобы набрать: фокус сразу в поле, каретка в конец ключа. Базовое окно
		// уже стоит в документе (его вставляет super), так что фокусировать есть что.
		// Не выделяем ключ целиком: правят обычно опечатку в нём, а выделенный он стёрся бы
		// первым же нажатием.
		this.__field.focus();
		this.__field.setSelectionRange(this.__field.value.length, this.__field.value.length);
	}

	/** Ключ, каким он уйдёт в текст: без краевых пробелов — объявленный их не содержит. */
	private __key(): string {
		return this.__field.value.trim();
	}

	/**
	 * Снимает из набранного символы разметки — так же, как это делает окно рандомизации
	 * с вариантами: набрать их нельзя ни клавишей, ни вставкой, ни перетаскиванием.
	 * Каретку держим на месте: чистка убирает символы до неё, и без поправки она уехала бы в конец.
	 */
	private __clean() {
		const { value, selectionStart } = this.__field;
		const clean = value.replace(FORBIDDEN_KEY_CHARS, "");

		if (clean !== value) {
			const before = value.slice(0, selectionStart ?? value.length).replace(FORBIDDEN_KEY_CHARS, "").length;

			this.__field.value = clean;
			this.__field.setSelectionRange(before, before);
		}

		this.__refresh();
	}

	/** Кнопка гаснет, пока набранное нельзя объявить: сохранить негодный ключ значит вернуть ошибку. */
	private __refresh() {
		this.__applyButton.disabled = !isVariableKey(this.__key());
	}

	private __save() {
		const key = this.__key();
		if (!isVariableKey(key)) return;

		this.__apply(buildVariable(key));
		this.close();
	}
}

/**
 * Разбирает список переменных из атрибута `data-variables` — когда разметку отдаёт сервер
 * и передавать список в опциях неоткуда.
 *
 * Две формы. Ключи через запятую, если названия не нужны: `data-variables="ИМЯ, ГОРОД"`.
 * Массив JSON, если нужны: элемент — строка либо объект `{ "key": "ИМЯ", "name": "Имя клиента" }`.
 * Разделитель только запятая: ключ может содержать пробелы (`{ИМЯ КЛИЕНТА}`), и по пробелу
 * такой ключ развалился бы на два.
 *
 * Негодный JSON — пустой список и сообщение в консоль: молча потерянный список выглядит
 * как «переменные не заданы», и причину пришлось бы искать в разметке.
 *
 * Записи без ключа и с символами разметки в ключе (`{}[]|`) отбрасываются: такой ключ не свернётся
 * в цельную конструкцию.
 */
export function parseVariables(value: string | null | undefined): MessageVariable[] {
	const text = value?.trim();
	if (!text) return [];

	if (!text.startsWith("[")) return text.split(",").map(toVariable).filter(isVariable);

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		console.error("MessageEditor: не удалось разобрать data-variables как JSON.", error);
		return [];
	}

	return Array.isArray(parsed) ? parsed.map(toVariable).filter(isVariable) : [];
}

function isVariable(item: MessageVariable | null): item is MessageVariable {
	return !!item;
}

/**
 * Прогоняет переданный в опциях список через те же правила, что и разбор `data-variables`:
 * ключ с символами разметки не свернётся в цельную конструкцию, откуда бы список ни пришёл,
 * а перенос в названии разорвал бы строку сообщения.
 *
 * Записи хоста возвращаются его же объектами: в них бывают свои поля (идентификатор, группа,
 * что угодно, чем приложение отличает переменную), и пересобранный литерал их бы потерял —
 * а список отдаётся наружу свойством `variables`. Пересобирается запись только тогда, когда
 * чистка что-то в ней выправила: тогда своё у записи остаётся, а ключ и название берутся
 * выправленные.
 */
export function cleanVariables(variables: MessageVariable[]): MessageVariable[] {
	const result: MessageVariable[] = [];

	for (const variable of variables) {
		const clean = toVariable(variable);
		// Негодный ключ отбрасываем, как и при разборе атрибута, но здесь список пришёл из кода —
		// про его ошибку сообщаем: молча потерянная переменная выглядит как «её забыли объявить».
		if (!clean) {
			console.error("MessageEditor: переменная отброшена — негодный ключ.", variable);
			continue;
		}

		result.push(
			clean.key === variable.key && clean.name === variable.name
				? variable
				: { ...variable, key: clean.key, name: clean.name }
		);
	}

	return result;
}

// Символы разметки в ключе: с ними `{ИМЯ}` перестаёт быть цельной конструкцией — подсветка
// поймает только кусок, а в значение уйдёт мусор, который подстановка на бэкенде не разберёт.
const FORBIDDEN_KEY = /[{}[\]|\n]/;
// Он же для чистки набранного в окне правки: один набор символов на проверку и на снятие.
const FORBIDDEN_KEY_CHARS = new RegExp(FORBIDDEN_KEY.source, "g");

// Ключ начинается и кончается буквой, цифрой или подчёркиванием — подчёркивание в именах полей
// обычное дело (`_id`, `USER_NAME_`). Между границами — что угодно, кроме запрещённого выше
// (пробелы, точки, дефисы в середине ключа встречаются). Границы держим строго: остальные
// символы по краям неотличимы от обычного текста вокруг скобок, и `{ }` или `{...}` становились
// бы переменной на ровном месте — а `{ ИМЯ }` не совпало бы с объявленным `{ИМЯ}` никогда.
const VARIABLE_KEY = /^[\p{L}\p{N}_](?:[^\n]*[\p{L}\p{N}_])?$/u;

/**
 * Ключ, приведённый к сравнимому виду: регистр в ключах не важен. Ключ набирают руками, глядя
 * на экран, и `{скидка}` — та же переменная, что `{СКИДКА}`; считать их разными значило бы
 * молча завести второе поле там, где имелось в виду первое.
 *
 * Сравнимый вид — только для сверки: в сообщение уходит объявленный ключ как есть (написанное
 * приводит к нему mapVariableNames в ./highlight), потому что подстановка ищет его буква в букву.
 *
 * Регистр снимается независимо от языка среды: ключ — не человеческий текст, и правила турецкой
 * «i» ему ни к чему, а вот разъехаться из-за них он бы мог.
 */
export function plainVariableKey(key: string): string {
	return key.toLowerCase();
}

/**
 * Годится ли написанное ключом переменной — ровно как есть, без чистки: буква, цифра или
 * подчёркивание по краям ({@link VARIABLE_KEY}) и никаких символов разметки внутри.
 *
 * Отдельно от {@link toKey}, потому что нужна и подсветке: набранный в тексте ключ она помечает
 * новой переменной только тогда, когда завести его и правда можно (см. isNewVariable в
 * ./highlight) — иначе пометка обещала бы то, чего не будет.
 */
export function isVariableKey(key: string): boolean {
	return VARIABLE_KEY.test(key) && !FORBIDDEN_KEY.test(key);
}

/**
 * Годный ли ключ. Пустой вставлять нечего, с символами разметки — нельзя, по краям — только
 * буква, цифра или подчёркивание. Все случаи молча отбрасываются: список приходит из разметки,
 * и одна кривая запись не повод лишать пользователя остальных.
 */
function toKey(value: unknown): string {
	const key = typeof value === "string" ? value.trim() : "";

	return isVariableKey(key) ? key : "";
}

// Переменная без годного ключа бессмысленна, поэтому такие элементы отбрасываются.
function toVariable(item: unknown): MessageVariable | null {
	if (typeof item === "string") {
		const key = toKey(item);
		return key ? { key } : null;
	}

	if (!item || typeof item !== "object") return null;

	const source = item as { key?: unknown; name?: unknown };
	const key = toKey(source.key);
	if (!key) return null;

	// Переносы в названии недопустимы: конструкция живёт в одной строке, а название подставляется
	// вместо неё. Не отбрасываем всю запись — схлопываем пробелы, смысл названия от этого цел.
	const name = typeof source.name === "string" ? source.name.replace(/\s+/g, " ").trim() : "";

	return name ? { key, name } : { key };
}
