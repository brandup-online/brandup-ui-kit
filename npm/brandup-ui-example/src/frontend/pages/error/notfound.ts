import { DOM } from "@brandup/ui-dom";
import { Page } from "../base";

export default class NotFoundPage extends Page {
	get typeName(): string { return "NotFoundPage" }
	get header(): string { return "Not found" }

	protected async onRenderContent(container: HTMLElement) {
		container.appendChild(DOM.tag("p", null, [`Not found page by url `, DOM.tag("b", null, this.context.url)]));
	}
}