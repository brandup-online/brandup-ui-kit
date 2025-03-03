import { DOM } from "@brandup/ui-dom";
import { Page } from "../base";

export default class ExceptionPage extends Page {
	get typeName(): string { return "ExceptionPage" }
	get header(): string { return "Error" }

	protected async onRenderContent(container: HTMLElement) {
		container.appendChild(DOM.tag("p", null, [`Error page by url `, DOM.tag("b", null, this.context.url)]));
	}
}