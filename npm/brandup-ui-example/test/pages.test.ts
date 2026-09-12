/**
 * @jest-environment jsdom
 */
import type { NavigateContext } from "@brandup/ui-app";
import { LocaleNamespaceImpl } from "@brandup/ui-i18n";
import type { ExampleApplication } from "../src/frontend/app";
import type { AppLocaleModel } from "../src/frontend/i18n";
import type { PageNavigationData } from "../src/frontend/typings/app";
import { Page } from "../src/frontend/pages/base";
import ru from "../src/frontend/locale/ru.json";
import en from "../src/frontend/locale/en.json";

// Страницы грузят разметку под текущий язык, а он разрешается при загрузке модуля `../i18n`.
// Поэтому каждый язык — свой прогон модулей, с нужным `<html lang>`.
type PageType = new (context: NavigateContext<ExampleApplication, PageNavigationData>) => Page;

const load = async (lang: string, route: string) => {
	document.documentElement.lang = lang;

	let type!: PageType;
	await jest.isolateModulesAsync(async () => {
		type = (await import(`../src/frontend/pages/${route}`)).default;
	});

	return type;
};

const ROUTES = [
	"index",
	"styles",
	"inputs",
	"buttons",
	"popups",
	"modal",
	"textbox",
	"richeditor",
	"messageeditor",
	"dropdown",
];

// У этих двух переводить нечего: одна показывает типографику, вторая — поля без подписей.
const WITHOUT_TEXT = ["styles", "inputs"];

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Текст страницы без её шапки: шапку рисует базовый класс из словаря, а разметку — сама страница.
 * Корневой элемент содержимого у страниц называется по-разному, поэтому берём всё, кроме шапки.
 */
const content = (page: Page) =>
	Array.from(page.element?.children ?? [])
		.filter((child) => !child.classList.contains("page-header"))
		.map((child) => child.textContent ?? "")
		.join(" ");

const render = async (lang: string, route: string) => {
	const PageClass = await load(lang, route);
	const model = lang === "ru" ? ru : en;
	const texts = new LocaleNamespaceImpl("app", <AppLocaleModel>model, <AppLocaleModel>model);
	const context = {
		app: { model: { texts } },
		data: {},
	} as unknown as NavigateContext<ExampleApplication, PageNavigationData>;

	const page = new PageClass(context);
	document.body.appendChild(await page.render());

	return page;
};

beforeAll(() => {
	Element.prototype.scrollTo = Element.prototype.scrollTo ?? function () {};
});

afterEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
});

describe.each(ROUTES)("страница %s", (route) => {
	it("рисуется по-русски", async () => {
		const page = await render("ru", route);

		expect(page.element).not.toBeNull();
		expect(document.querySelector(".page-header h1")?.textContent).toBeTruthy();

		// Смотрим на содержимое, а не на всё тело: заголовок страницы приходит из словаря модели,
		// и русский в нём был бы и при английской разметке — проверка прошла бы впустую.
		if (!WITHOUT_TEXT.includes(route)) expect(content(page)).toMatch(CYRILLIC);
	});

	// Подписи самих контролов кита здесь не проверяются: каждый прогон грузит модули заново
	// (`isolateModules`), и реестр кита у страницы свой — объявленное снаружи до него не доходит.
	// Их проверяют словарные тесты в самих пакетах.
	it("рисуется по-английски и не показывает русского", async () => {
		const page = await render("en", route);

		expect(page.element).not.toBeNull();
		expect(document.body.textContent ?? "").not.toMatch(CYRILLIC);
	});
});
