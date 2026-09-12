import { Page } from "./base";
import { pickContent } from "../i18n";
import "./dropdown.less";
import DropDown from "@brandup/ui-dropdown";

export default class DropDownPage extends Page {
	get typeName(): string {
		return "DropDownPage";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.dropdown);
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./dropdown.html"), en: () => import("./dropdown.en.html") })
		);

		const elements = container.querySelectorAll<HTMLSelectElement>('select[data-content-script="dropdown"]');

		elements.forEach((element) => {
			new DropDown(element);
		});
	}
}
