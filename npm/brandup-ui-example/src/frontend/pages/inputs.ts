import { DOM } from "@brandup/ui-dom";
import { Page } from "./base";
import html from "./inputs.html";
import "./inputs.less";

export default class NavigationPage extends Page {
	get typeName(): string { return "InputsModel" }
	get header(): string { return "Input controls" }

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		const controls = DOM.queryElements(container, ".control");
		controls.forEach(control => {
			const html = control.innerHTML.replace(/[\u00A0-\u9999<>\&]/g, i => '&#' + i.charCodeAt(0) + ';');
			control.insertAdjacentElement("afterend", DOM.tag("pre", "html", html.trim()));
		});
	}
}