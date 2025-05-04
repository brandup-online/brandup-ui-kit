import { Page } from "./base";
import html from "./styles.html";
import "./styles.less";

export default class AjaxPage extends Page {
	get typeName(): string { return "StylesPage" }
	get header(): string { return "Styles" }

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);
	}
}