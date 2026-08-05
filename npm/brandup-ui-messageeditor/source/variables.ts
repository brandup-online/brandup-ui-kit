import { DOM } from "@brandup/ui";
import { Modal } from "@brandup/ui-kit";

export const VARIABLE_OPEN = "{";
export const VARIABLE_CLOSE = "}";

const PICK_COMMAND = "variables-pick";

/** Переменная персонализации: подставляется приложением при отправке. */
export interface MessageVariable {
	/** Имя внутри фигурных скобок, например `ИМЯ`. */
	name: string;
	/** Пояснение в списке; по умолчанию показывается только имя. */
	title?: string;
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
			const name = context.target.getAttribute("data-variable");
			if (!name) return;

			this.__apply(buildVariable(name));
			this.close();
		});

		this.__renderList();
	}

	private __renderList() {
		const list = DOM.tag("div", { class: "variables" });
		this.body.appendChild(list);

		if (!this.__variables.length) {
			list.appendChild(DOM.tag("div", { class: "empty" }, this.__emptyText));
			return;
		}

		this.__variables.forEach((variable) =>
			list.appendChild(
				DOM.tag(
					"button",
					{ type: "button", class: "variable", "data-command": PICK_COMMAND, "data-variable": variable.name },
					[
						DOM.tag("span", { class: "name" }, buildVariable(variable.name)),
						variable.title ? DOM.tag("span", { class: "title" }, variable.title) : null,
					]
				)
			)
		);
	}
}

/** Оборачивает имя в разметку переменной. */
export function buildVariable(name: string): string {
	return `${VARIABLE_OPEN}${name}${VARIABLE_CLOSE}`;
}

/**
 * Разбирает список переменных из атрибута `data-variables` — когда разметку отдаёт сервер
 * и передавать список в опциях неоткуда.
 *
 * Две формы. Имена через запятую, если пояснения не нужны: `data-variables="ИМЯ, ГОРОД"`.
 * Массив JSON, если нужны: элемент — строка либо объект `{ "name": "ИМЯ", "title": "Имя" }`.
 * Разделитель только запятая: имя переменной может содержать пробелы (`{ИМЯ КЛИЕНТА}`),
 * и по пробелу такое имя развалилось бы на два.
 *
 * Негодный JSON — пустой список и сообщение в консоль: молча потерянный список выглядит
 * как «переменные не заданы», и причину пришлось бы искать в разметке.
 *
 * Записи без имени и с символами разметки в имени (`{}[]|`) отбрасываются: такое имя не свернётся
 * в цельную конструкцию.
 */
export function parseVariables(value: string | null): MessageVariable[] {
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

// Символы разметки в имени: с ними `{ИМЯ}` перестаёт быть цельной конструкцией — подсветка
// поймает только кусок, а в значение уйдёт мусор, который подстановка на бэкенде не разберёт.
const FORBIDDEN_NAME = /[{}[\]|\n]/;

/**
 * Годное ли имя. Пустое вставлять нечего, с символами разметки — нельзя.
 * Оба случая молча отбрасываются: список приходит из разметки, и одна кривая запись
 * не повод лишать пользователя остальных.
 */
function toName(value: unknown): string {
	const name = typeof value === "string" ? value.trim() : "";

	return name && !FORBIDDEN_NAME.test(name) ? name : "";
}

// Переменная без годного имени бессмысленна, поэтому такие элементы отбрасываются.
function toVariable(item: unknown): MessageVariable | null {
	if (typeof item === "string") {
		const name = toName(item);
		return name ? { name } : null;
	}

	if (!item || typeof item !== "object") return null;

	const source = item as { name?: unknown; title?: unknown };
	const name = toName(source.name);
	if (!name) return null;

	const title = typeof source.title === "string" ? source.title.trim() : "";

	return title ? { name, title } : { name };
}
