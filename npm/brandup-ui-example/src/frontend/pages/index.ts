import { Page } from "./base";
import html from "./index.html";

export default class IndexModel extends Page {
	get typeName(): string { return "IndexModel" }
	get header(): string { return "Web interface UI kit" }

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);
	}
}