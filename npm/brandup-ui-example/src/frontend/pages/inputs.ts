import { Page } from "./base";

export default class NavigationPage extends Page {
	get typeName(): string { return "AboutModel" }
	get header(): string { return "Commands" }

	protected onRenderContent(container: HTMLElement): Promise<void> {
		return Promise.resolve();
	}
}