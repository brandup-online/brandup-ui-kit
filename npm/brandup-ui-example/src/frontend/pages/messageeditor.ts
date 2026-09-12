import { Page } from "./base";
import { pickContent, type AppTexts } from "../i18n";
import "./messageeditor.less";
import MessageEditor, { type MessageEditorOptions } from "@brandup/ui-messageeditor";

// Свойства персонализации знает приложение, а не компонент; на выбранном языке — и ключи,
// и названия: в сообщение уходит ключ, и набирают его с экрана.
const variables = (texts: AppTexts) => [
	{ key: texts.t((m) => m.demo.messageeditor.nameKey), name: texts.t((m) => m.demo.messageeditor.nameTitle) },
	{ key: texts.t((m) => m.demo.messageeditor.surnameKey), name: texts.t((m) => m.demo.messageeditor.surnameTitle) },
	{ key: texts.t((m) => m.demo.messageeditor.cityKey), name: texts.t((m) => m.demo.messageeditor.cityTitle) },
	{ key: texts.t((m) => m.demo.messageeditor.companyKey), name: texts.t((m) => m.demo.messageeditor.companyTitle) },
];

export default class MessageEditorPage extends Page {
	private __editors: MessageEditor[] = [];

	get typeName(): string {
		return "MessageEditorPage";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.messageeditor);
	}

	protected async onRenderContent(container: HTMLElement) {
		const texts = this.app.model.texts;

		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./messageeditor.html"), en: () => import("./messageeditor.en.html") })
		);

		container
			.querySelectorAll<HTMLTextAreaElement>('textarea[data-content-script="messageeditor"]')
			.forEach((elem) => {
				// свойства объявлены в разметке — пусть компонент разберёт их сам, иначе переданные
				// в опциях имеют приоритет и атрибуты в примере ничего бы не показали
				const fromMarkup = elem.hasAttribute("data-variables") || elem.hasAttribute("data-variables-empty");
				const options: MessageEditorOptions = fromMarkup ? {} : { variables: variables(texts) };

				// Настройка полей — действие приложения (SPA-переход или своё окно); в примере
				// вместо экрана настройки — заглушка. Строкой это был бы адрес обычной ссылки.
				if (elem.hasAttribute("data-variables-empty"))
					options.variablesSetup = () => window.alert(texts.t((m) => m.demo.messageeditor.setup));

				const editor = new MessageEditor(elem, options);
				this.__editors.push(editor);

				this.__bindValue(editor);
			});
	}

	// Живое значение под плашкой: показывает разметку, которая уйдёт в хранилище. В режиме новых
	// свойств к нему дописывается то, что предстоит завести, — этот список и есть работа хоста.
	private __bindValue(editor: MessageEditor) {
		const valueElem = editor.element.closest(".field")?.querySelector<HTMLElement>(".value");
		if (!valueElem) return;

		const texts = this.app.model.texts;

		const print = () => {
			const value = editor.getValue() || texts.t((m) => m.demo.messageeditor.empty);
			const toCreate = editor.newVariables ? editor.unknownVariables : [];

			valueElem.textContent = toCreate.length
				? `${value}\n\n${texts.t((m) => m.demo.messageeditor.toCreate, { keys: toCreate.join(", ") })}`
				: value;
		};

		editor.onChange(print);
		print();
	}

	override destroy() {
		this.__editors.forEach((editor) => editor.destroy());
		this.__editors = [];

		super.destroy();
	}
}
