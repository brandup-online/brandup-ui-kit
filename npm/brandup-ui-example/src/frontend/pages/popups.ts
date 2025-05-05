import { DOM } from "@brandup/ui-dom";
import { Page } from "./base";
import html from "./popups.html";
import "./popups.less";
import { PopupManager } from "@brandup/ui-kit/source/popup";

export default class PopupsPage extends Page {
	get typeName(): string { return "PopupsPage" }
	get header(): string { return "Popups" }

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML("beforeend", html);

		this.registerCommand("open", context => {
			PopupManager.open(context.target.nextElementSibling as HTMLElement, { initiator: context.target });
		});
	}
}