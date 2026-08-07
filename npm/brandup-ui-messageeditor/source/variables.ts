import "./variables.less"; // стили окна

import { DOM } from "@brandup/ui";
import { Modal, textTag } from "@brandup/ui-kit";

export const VARIABLE_OPEN = "{";
export const VARIABLE_CLOSE = "}";

const PICK_COMMAND = "variables-pick";

/** Переменная персонализации: подставляется приложением при отправке. */
export interface MessageVariable {
	/** Ключ внутри фигурных скобок, например `ИМЯ`. Он и уходит в значение сообщения. */
	key: string;
	/** Название: показывается вместо ключа и в тексте, и в списке. Без него виден ключ. */
	name?: string;
}

/**
 * Текст в окне, когда список переменных пуст. Заменяется на свой: причина пустого списка
 * известна приложению, а не компоненту («выберите аудиторию», «переменных нет у этого шаблона»).
 */
export const VARIABLES_EMPTY_TEXT = "Переменные не заданы.";

/** Выбор переменной персонализации из списка; выбранная вставляется как `{ИМЯ}`. */
export default class VariablesModal extends Modal {
	private readonly __variables: MessageVariable[];
	private readonly __apply: (text: string) => void;
	private readonly __emptyText: string;

	override get typeName(): string {
		return "BrandUp.MessageEditor.Variables";
	}

	constructor(variables: MessageVariable[], apply: (text: string) => void, emptyText?: string | null) {
		super({ title: "Персонализация", className: "messageeditor-variables" });

		this.__variables = variables;
		this.__apply = apply;
		this.__emptyText = emptyText?.trim() || VARIABLES_EMPTY_TEXT;

		this.registerCommand(PICK_COMMAND, (context) => {
			const key = context.target.dataset.variable;
			if (!key) return;

			this.__apply(buildVariable(key));
			this.close();
		});

		this.__renderList();
	}

	private __renderList() {
		const list = DOM.tag("div", { class: "variables" });
		this.body.appendChild(list);

		// the hint, names and keys are host data (options or attributes of the value element) —
		// they go in as text, never as markup (see textTag)
		if (!this.__variables.length) {
			list.appendChild(textTag("div", { class: "empty" }, this.__emptyText));
			return;
		}

		this.__variables.forEach((variable) =>
			list.appendChild(
				DOM.tag(
					"button",
					{ type: "button", class: "variable", command: PICK_COMMAND, dataset: { variable: variable.key } },
					// Сначала — как переменная будет выглядеть в сообщении, следом ключ: выбирают
					// по виду, а ключ лишь уточняет, что уйдёт в текст. Без названия показывать
					// ключ дважды незачем — вид и есть ключ.
					[
						textTag("span", { class: "preview" }, buildVariable(variable.name ?? variable.key)),
						// ключ без скобок: он не образец для вставки, а пометка — что именно уйдёт в текст
						variable.name ? textTag("span", { class: "key" }, variable.key) : null,
					]
				)
			)
		);
	}
}

/** Оборачивает ключ (или показываемое вместо него название) в разметку переменной. */
export function buildVariable(key: string): string {
	return `${VARIABLE_OPEN}${key}${VARIABLE_CLOSE}`;
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

/**
 * Годный ли ключ. Пустой вставлять нечего, с символами разметки — нельзя.
 * Оба случая молча отбрасываются: список приходит из разметки, и одна кривая запись
 * не повод лишать пользователя остальных.
 */
function toKey(value: unknown): string {
	const key = typeof value === "string" ? value.trim() : "";

	return key && !FORBIDDEN_KEY.test(key) ? key : "";
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
