/**
 * @jest-environment jsdom
 */
import type { LanguageLabels } from "../src/frontend/language-switch";

// Язык разрешается при загрузке модуля — из `<html lang>`, как его ставит скрипт в шапке
// документа. Поэтому каждый случай грузит модули заново, с нужным атрибутом.
const load = async (lang: string, stored?: string) => {
	document.documentElement.lang = lang;
	if (stored) localStorage.setItem("uikit-lang", stored);

	let module!: typeof import("../src/frontend/language-switch");
	await jest.isolateModulesAsync(async () => {
		module = await import("../src/frontend/language-switch");
	});

	return module;
};

const LABELS: LanguageLabels = { title: "Язык интерфейса", toRu: "Русский", toEn: "English" };

const restart = jest.fn();
const button = () => document.querySelector<HTMLButtonElement>("[data-language-switch]")!;
const label = () => document.querySelector<HTMLElement>("[data-language-switch-label]")!;

beforeEach(() => {
	document.body.innerHTML =
		'<button type="button" data-language-switch><span data-language-switch-label></span></button>';
	localStorage.clear();
	restart.mockClear();
});

describe("кнопка называет язык, на который переключает", () => {
	it("на русской странице предлагает английский", async () => {
		const { initLanguageSwitch } = await load("ru");

		initLanguageSwitch(LABELS, restart);

		expect(label().textContent).toBe("English");
		expect(button().getAttribute("lang")).toBe("en");
		expect(button().getAttribute("aria-label")).toBe("Язык интерфейса");
	});

	it("на английской предлагает русский", async () => {
		const { initLanguageSwitch } = await load("en");

		initLanguageSwitch(LABELS, restart);

		expect(label().textContent).toBe("Русский");
		expect(button().getAttribute("lang")).toBe("ru");
	});

	// Язык вне списка сводится к языку по умолчанию — английскому, как и у пакетов кита.
	it("незнакомый язык считает языком по умолчанию", async () => {
		const { initLanguageSwitch } = await load("de");

		initLanguageSwitch(LABELS, restart);

		expect(label().textContent).toBe("Русский");
	});
});

// Раньше сохранённый выбор применял скрипт, вписанный в шапку документа; теперь это делает
// сам движок при загрузке модуля — до того, как прочитает `<html lang>`.
it("сохранённый выбор сильнее языка документа", async () => {
	const { initLanguageSwitch } = await load("ru", "en");

	initLanguageSwitch(LABELS, restart);

	expect(document.documentElement.lang).toBe("en");
	expect(label().textContent).toBe("Русский");
});

describe("нажатие", () => {
	const click = () => button().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

	it("запоминает выбор и перезагружает страницу", async () => {
		const { initLanguageSwitch } = await load("ru");
		initLanguageSwitch(LABELS, restart);

		click();

		expect(localStorage.getItem("uikit-lang")).toBe("en");
		expect(document.documentElement.lang).toBe("en");
		expect(restart).toHaveBeenCalledTimes(1);
	});

	// Выбор пишется полностью, а не «ru или ничего»: пустое значение означало бы «как в документе»,
	// и выбранный язык не пережил бы перезагрузку.
	it("запоминает и обратное переключение", async () => {
		const { initLanguageSwitch } = await load("en");
		initLanguageSwitch(LABELS, restart);

		click();

		expect(localStorage.getItem("uikit-lang")).toBe("ru");
		expect(document.documentElement.lang).toBe("ru");
	});

	// Приватный режим: выбор запомнить негде, но язык всё равно меняется — до перезагрузки.
	it("переживает недоступное хранилище", async () => {
		const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("private mode");
		});

		try {
			const { initLanguageSwitch } = await load("ru");
			initLanguageSwitch(LABELS, restart);

			expect(click).not.toThrow();
			expect(document.documentElement.lang).toBe("en");
			expect(restart).toHaveBeenCalledTimes(1);
		} finally {
			setItem.mockRestore();
		}
	});
});

it("без кнопки в разметке ничего не делает", async () => {
	document.body.innerHTML = "";
	const { initLanguageSwitch } = await load("ru");

	expect(() => initLanguageSwitch(LABELS)).not.toThrow();
});
