import { Page } from "./base";

export default class FormsPage extends Page {
	get typeName(): string { return "FormsPage" }
	get header(): string { return "Forms" }

	protected onRenderContent(container: HTMLElement): Promise<void> {
		return Promise.resolve();
	}
}