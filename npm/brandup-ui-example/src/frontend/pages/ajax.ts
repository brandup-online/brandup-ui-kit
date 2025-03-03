import { Page } from "./base";

export default class AjaxPage extends Page {
	get typeName(): string { return "AjaxPage" }
	get header(): string { return "AJAX" }

	protected onRenderContent(container: HTMLElement): Promise<void> {
		return Promise.resolve();
	}
}