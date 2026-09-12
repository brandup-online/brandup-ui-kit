import { DOM } from "@brandup/ui";
import { textTag } from "@brandup/ui-kit/text";
import { Page } from "./base";
import arrowIcon from "../svg/arrow-right.svg";

/**
 * Главная: список страниц примера.
 *
 * Собирается здесь, а не в разметке: подписи — это названия самих страниц, и они уже есть
 * в словаре (см. i18n.ts). Разметкой их пришлось бы держать вторым списком, по копии на язык.
 */
const ROUTES = [
	"styles",
	"inputs",
	"buttons",
	"popups",
	"modal",
	"textbox",
	"richeditor",
	"messageeditor",
	"dropdown",
] as const;

export default class IndexModel extends Page {
	get typeName(): string {
		return "IndexModel";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.index);
	}

	protected async onRenderContent(container: HTMLElement) {
		const texts = this.app.model.texts;

		container.appendChild(
			DOM.tag("section", { class: "page-block features" }, [
				DOM.tag(
					"menu",
					null,
					ROUTES.map((route) =>
						// Название страницы — из словаря, поэтому текстом; стрелка — иконка, разметкой.
						DOM.tag("a", { href: `/${route}`, class: "applink" }, [
							textTag("span", null, texts.t(`pages.${route}`)),
							arrowIcon,
						])
					)
				),
			])
		);
	}
}
