/**
 * @jest-environment jsdom
 */
import { LayerManager, PopupManager, UIKIT } from "@brandup/ui-kit";
import ModalPage from "../src/frontend/pages/modal";
import type { NavigateContext } from "@brandup/ui-app";
import type { ExampleApplication } from "../src/frontend/app";
import type { PageNavigationData } from "../src/frontend/typings/app";

// Страница показывает окно, стек слоёв и свой слой — то, у чего в README кита есть описание,
// но не было ни одного работающего примера. Проверяем её так, как её видит читатель: клик
// по кнопке, разметка на экране, Escape.

// Странице от контекста навигации нужны только `app` и `data`: первое она кладёт в поле,
// второе — то, куда страница записывает себя. Полное приложение ради этого не поднимаем.
const page = async () => {
	const context = { app: {}, data: {} } as unknown as NavigateContext<ExampleApplication, PageNavigationData>;
	const instance = new ModalPage(context);

	document.body.appendChild(await instance.render());

	return instance;
};

const click = (selector: string) => {
	const elem = document.querySelector<HTMLElement>(selector);
	if (!elem) throw new Error(`Не найдено: ${selector}`);

	elem.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
};

const escape = () =>
	document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

const modals = () => document.querySelectorAll(`.${UIKIT.MODAL.CLASS.ROOT}`);

beforeEach(() => {
	document.body.innerHTML = "";
	LayerManager.closeAll();
});

test("кнопка открывает окно, а закрытие внутри тела его убирает", async () => {
	await page();

	click('[data-command="open"]');
	expect(modals()).toHaveLength(1);

	click(`.${UIKIT.MODAL.CLASS.ROOT} [data-command="${UIKIT.MODAL.COMMAND.CLOSE}"]`);
	expect(modals()).toHaveLength(0);
});

test("окно выбора отдаёт ответ странице и не рисует шапку с крестиком", async () => {
	await page();

	click('[data-command="confirm"]');
	expect(document.querySelector(`.${UIKIT.MODAL.CLASS.ELEMENT.CLOSE}`)).toBeNull();

	click('[data-command="confirm-yes"]');
	expect(modals()).toHaveLength(0);
	expect(document.querySelector("[data-answer]")?.textContent).toBe("ответ: да");

	click('[data-command="confirm"]');
	click('[data-command="confirm-no"]');
	expect(document.querySelector("[data-answer]")?.textContent).toBe("ответ: нет");
});

test("попап внутри окна встаёт над ним, и Escape снимает слои по одному", async () => {
	await page();

	click('[data-command="layers"]');
	expect(modals()).toHaveLength(1);

	// Команду `ui-popup-toggle` регистрирует UiKitMiddleware — здесь приложения нет, поэтому
	// делаем ровно то же, что делает оно: попап у кнопки — её nextElementSibling. Проверка этого
	// соседства и есть половина смысла: разметка окна должна остаться такой, какую ждёт кит.
	const toggle = document.querySelector<HTMLElement>(
		`.${UIKIT.MODAL.CLASS.ROOT} [data-command="${UIKIT.POPUP.COMMAND.TOGGLE}"]`
	)!;
	const popup = toggle.nextElementSibling as HTMLElement;
	expect(popup.classList.contains(UIKIT.POPUP.CLASS.ROOT)).toBe(true);

	PopupManager.toggle(popup, { initiator: toggle });
	expect(document.querySelector(`.${UIKIT.POPUP.CLASS.OPENED}`)).not.toBeNull();

	escape();
	expect(document.querySelector(`.${UIKIT.POPUP.CLASS.OPENED}`)).toBeNull();
	expect(modals()).toHaveLength(1);

	escape();
	expect(modals()).toHaveLength(0);
});

test("своя панель живёт слоем: Escape закрывает её и придержанную прокрутку отпускает", async () => {
	await page();

	const panel = document.querySelector<HTMLElement>("[data-panel]")!;
	expect(panel.hidden).toBe(true);

	click('[data-command="panel"]');
	expect(panel.hidden).toBe(false);
	expect(LayerManager.count).toBe(1);
	expect(document.body.classList.contains("body-side-panel-opened")).toBe(true);

	escape();
	expect(panel.hidden).toBe(true);
	expect(LayerManager.count).toBe(0);
	expect(document.body.classList.contains("body-side-panel-opened")).toBe(false);

	// Второе открытие после закрытия по Escape: слой снят, а не оставлен в стеке.
	click('[data-command="panel"]');
	expect(LayerManager.count).toBe(1);

	click('[data-command="panel-close"]');
	expect(panel.hidden).toBe(true);
	expect(LayerManager.count).toBe(0);
});

// Счётчик обновляется не из обработчика команды, а после него — стек меняют и кит (попап внутри
// окна), и Escape, мимо любого обработчика страницы. Поэтому проверка ждёт следующий тик.
test("счётчик слоёв показывает то, что в стеке на самом деле", async () => {
	await page();

	const settle = () => new Promise((resolve) => setTimeout(resolve));
	const depth = () => document.querySelector("[data-depth]")?.textContent;

	expect(depth()).toBe("слоёв открыто: 0");

	click('[data-command="panel"]');
	await settle();
	expect(depth()).toBe("слоёв открыто: 1");

	escape();
	await settle();
	expect(depth()).toBe("слоёв открыто: 0");
});
