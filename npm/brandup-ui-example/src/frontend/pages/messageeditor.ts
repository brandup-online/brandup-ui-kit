import { Page } from "./base";
import html from "./messageeditor.html";
import "./messageeditor.less";
import MessageEditor from "@brandup/ui-messageeditor";

// переменные персонализации знает приложение, а не компонент
const VARIABLES = [
	{ key: "ИМЯ", name: "Имя подписчика" },
	{ key: "ФАМИЛИЯ", name: "Фамилия подписчика" },
	{ key: "ГОРОД", name: "Город из профиля" },
	{ key: "КОМПАНИЯ", name: "Название компании" },
];

export default class MessageEditorPage extends Page {
	private __editors: MessageEditor[] = [];

	get typeName(): string {
		return "MessageEditorPage";
	}
	get header(): string {
		return "MessageEditor";
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		container
			.querySelectorAll<HTMLTextAreaElement>('textarea[data-content-script="messageeditor"]')
			.forEach((elem) => {
				// переменные объявлены в разметке — пусть компонент разберёт их сам, иначе переданные
				// в опциях имеют приоритет и атрибуты в примере ничего бы не показали
				const fromMarkup =
					elem.hasAttribute("data-variables") || elem.hasAttribute("data-variables-empty");
				const options = fromMarkup ? {} : { variables: VARIABLES };
				const editor = new MessageEditor(elem, options);
				this.__editors.push(editor);

				this.__bindValue(editor);
			});
	}

	// Живое значение под плашкой: показывает разметку, которая уйдёт в хранилище.
	private __bindValue(editor: MessageEditor) {
		const valueElem = editor.element.closest(".field")?.querySelector<HTMLElement>(".value");
		if (!valueElem) return;

		const print = () => (valueElem.textContent = editor.getValue() || "(пусто)");

		editor.onChange(print);
		print();
	}

	override destroy() {
		this.__editors.forEach((editor) => editor.destroy());
		this.__editors = [];

		super.destroy();
	}
}
