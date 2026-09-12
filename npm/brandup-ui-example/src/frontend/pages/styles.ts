import { Page } from "./base";
import html from "./styles.html";
import "./styles.less";

export default class StylesPage extends Page {
	get typeName(): string {
		return "StylesPage";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.styles);
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);
	}
}
