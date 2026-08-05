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

/** Выбор переменной персонализации из списка; выбранная вставляется как `{ИМЯ}`. */
export default class VariablesModal extends Modal {
	private readonly __variables: MessageVariable[];
	private readonly __apply: (text: string) => void;

	override get typeName(): string {
		return "BrandUp.MessageEditor.Variables";
	}

	constructor(variables: MessageVariable[], apply: (text: string) => void) {
		super({ title: "Персонализация", className: "messageeditor-variables" });

		this.__variables = variables;
		this.__apply = apply;

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
			list.appendChild(DOM.tag("div", { class: "empty" }, "Переменные не заданы."));
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
