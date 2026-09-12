/**
 * @jest-environment jsdom
 */
import type { EnvironmentModel } from "@brandup/ui-app";
import { LocaleNamespaceImpl } from "@brandup/ui-i18n";
import { ExampleApplication } from "../src/frontend/app";
import type { AppLocaleModel } from "../src/frontend/i18n";
import type { ExampleApplicationModel } from "../src/frontend/typings/app";

// Оболочку рисует `_onRenderElement`, а вызывает его `setElement` — он защищённый, и в браузере
// его зовёт `run()`. Полное приложение ради разметки шапки не поднимаем: наследник открывает
// ровно ту дверь, в которую входит `run()`.
class TestApplication extends ExampleApplication {
	render(host: HTMLElement) {
		this.setElement(host);
	}
}

const MODEL = {
	nav: { home: "Главная" },
	theme: { toDark: "Тёмная тема", toLight: "Светлая тема" },
	language: { title: "Язык интерфейса", toRu: "Русский", toEn: "English" },
};

// Неймспейс настоящий, тот же, что отдаёт движок: подписи берутся из него лямбдой, и подделка
// проверяла бы разбор ключа мимо того, что работает в браузере.
const texts = (model: object) => new LocaleNamespaceImpl("app", <AppLocaleModel>model, <AppLocaleModel>model);

// Свой контейнер на каждый случай: элемент запоминает связанный с ним UIElement, и `document.body`
// второму приложению достался бы уже занятым.
const render = (model: object = MODEL) => {
	const host = document.createElement("div");
	document.body.appendChild(host);

	const appModel = <ExampleApplicationModel>{ texts: texts(model) };
	new TestApplication({ basePath: "" } as EnvironmentModel, appModel).render(host);

	return host;
};

beforeEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
	localStorage.clear();
});

// Приложение убираем сразу после теста, а не только перед следующим: за последним теста нет, и оно
// доживает в DOM до сноса jsdom. Разбирая документ, jsdom удаляет его узлы, наблюдатель @brandup/ui
// ставит на это авторазрушение контролов — и оно выполняется, когда прогон уже закончен. Наружу это
// выходит не упавшим тестом, а ненулевым кодом возврата после зелёного отчёта: на агенте с двумя
// ядрами jest идёт in-band, и ошибка убивает главный процесс.
afterEach(() => {
	document.body.innerHTML = "";
});

it("шапка и контейнер страниц собираются в разметке", () => {
	const host = render();

	expect(host.querySelector("nav.app-nav")).not.toBeNull();
	expect(host.querySelector("a.logo svg")).not.toBeNull();
	// Контейнер ищет middleware страниц по идентификатору — без него страницы рисовать некуда.
	expect(document.getElementById("app-content")).not.toBeNull();
});

it("подписи шапки берутся из модели", () => {
	const host = render();

	expect(host.querySelector("nav.app-nav ul a")?.textContent).toBe("Главная");
});

// Подпись хоста уходит в разметку текстом, а не разметкой: пришла она из словаря, а словарь
// правит приложение.
it("подпись ссылки вставляется текстом", () => {
	const host = render({ ...MODEL, nav: { home: "<img src=x onerror=alert(1)>" } });

	const link = host.querySelector("nav.app-nav ul a")!;
	expect(link.querySelector("img")).toBeNull();
	expect(link.textContent).toBe("<img src=x onerror=alert(1)>");
});

it("переключалки подключены и названы", () => {
	const host = render();

	const theme = host.querySelector("[data-theme-switch] [data-theme-switch-label]");
	const language = host.querySelector("[data-language-switch] [data-language-switch-label]");

	// Каждая кнопка названа тем, на что переключает: тема по умолчанию светлая, язык документа
	// в jsdom не задан — значит язык по умолчанию, английский, и кнопка предлагает русский.
	expect(theme?.textContent).toBe("Тёмная тема");
	expect(language?.textContent).toBe("Русский");
});
