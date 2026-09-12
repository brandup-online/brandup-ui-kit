import { Page } from "./base";
import { pickContent } from "../i18n";
import "./textbox.less";
import TextBox from "@brandup/ui-textbox";

export default class TextboxPage extends Page {
	get typeName(): string {
		return "TextboxPage";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.textbox);
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./textbox.html"), en: () => import("./textbox.en.html") })
		);

		const elements = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
			'input[data-content-script="textbox"], textarea[data-content-script="textbox"]'
		);

		elements.forEach((element) => {
			new TextBox(element);
		});
	}
}
