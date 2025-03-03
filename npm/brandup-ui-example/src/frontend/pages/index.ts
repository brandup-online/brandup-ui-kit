import { Page } from "./base";

export default class IndexModel extends Page {
	get typeName(): string { return "IndexModel" }
	get header(): string { return "User interface framework" }

	protected async onRenderContent(container: HTMLElement) {
		const html = await import("./templates/index.html");
		container.insertAdjacentHTML("beforeend", html.default);
	}
}