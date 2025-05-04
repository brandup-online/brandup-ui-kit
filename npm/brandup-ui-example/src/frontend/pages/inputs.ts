import { Page } from "./base";
import html from "./inputs.html";

export default class NavigationPage extends Page {
	get typeName(): string { return "InputsModel" }
	get header(): string { return "Input controls" }

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);
	}
}