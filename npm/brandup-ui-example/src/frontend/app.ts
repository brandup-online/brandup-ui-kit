import { DOM } from "@brandup/ui";
import { Application } from "@brandup/ui-app";
import { textTag } from "@brandup/ui-kit/text";
import type { ExampleApplicationModel } from "./typings/app";
import { initThemeSwitch } from "./theme-switch";
import { initLanguageSwitch } from "./language-switch";
import logoIcon from "./svg/logo.svg";

/**
 * Приложение примера: собирает собственную оболочку — шапку с навигацией и переключалками
 * и контейнер, в который middleware страниц рисует страницы.
 *
 * Оболочка собирается здесь, а не пишется в `template.html`, потому что её подписи зависят
 * от языка: разметка документа отдаётся одна на все языки, и текст в ней пришлось бы после
 * загрузки переписывать по атрибутам. Модель приложения приносит уже выбранный язык
 * (см. index.ts), и шапка строится сразу такой, какой её увидят.
 */
export class ExampleApplication extends Application<ExampleApplicationModel> {
	/**
	 * Вызывается из `run()`, когда приложение получает свой элемент (по умолчанию `body`) —
	 * до старта middleware, поэтому контейнер страниц к их запуску уже на месте.
	 */
	protected override _onRenderElement(element: HTMLElement) {
		const texts = this.model.texts;

		element.appendChild(
			DOM.tag("div", { class: "app" }, [
				DOM.tag("nav", { class: "app-nav", role: "navigation" }, [
					DOM.tag("div", { class: "content-width" }, [
						// Строка внутри `DOM.tag` вставляется разметкой — так сюда и попадает иконка.
						// Всё, что приходит из словаря, ставится текстом (см. textTag).
						DOM.tag("a", { href: "/", class: "logo applink" }, [
							DOM.tag("i", null, logoIcon),
							DOM.tag("span", null, "UI KIT"),
						]),
						DOM.tag("ul", null, [
							DOM.tag("li", null, [
								textTag(
									"a",
									{ href: "/", class: "applink" },
									texts.t((m) => m.nav.home)
								),
							]),
						]),
						// Подписи кнопкам ставят сами переключалки: каждая знает, на что переключает.
						DOM.tag(
							"button",
							{ type: "button", class: "ui-button mini theme-switch", dataset: { themeSwitch: null } },
							[DOM.tag("span", { dataset: { themeSwitchLabel: null } })]
						),
						DOM.tag(
							"button",
							{
								type: "button",
								class: "ui-button mini language-switch",
								dataset: { languageSwitch: null },
							},
							[DOM.tag("span", { dataset: { languageSwitchLabel: null } })]
						),
					]),
				]),
				DOM.tag("main", { id: "app-content", role: "main", class: "app-content content-width" }),
			])
		);

		// Кнопки переключалок помечены `data-*`, и находят они их сами — тем же способом, каким
		// нашёл бы хост, написавший шапку в разметке.
		initThemeSwitch({ toDark: texts.t((m) => m.theme.toDark), toLight: texts.t((m) => m.theme.toLight) });
		initLanguageSwitch({
			title: texts.t((m) => m.language.title),
			toRu: texts.t((m) => m.language.toRu),
			toEn: texts.t((m) => m.language.toEn),
		});
	}
}
