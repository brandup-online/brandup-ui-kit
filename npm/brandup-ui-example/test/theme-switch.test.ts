/**
 * @jest-environment jsdom
 */
import { applyStoredTheme } from "../src/frontend/theme-switch";

// Системная настройка спрашивается один раз, при загрузке модуля, поэтому подменяется до импорта
// в общем файле подготовки (см. test/setup.ts): здесь достаточно ответа «не тёмная».
const theme = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
	document.documentElement.removeAttribute("data-theme");
	localStorage.clear();
});

// Раньше это делал скрипт, вписанный в шапку документа; теперь — первая строка приложения.
it("выбранная тёмная тема применяется к документу", () => {
	localStorage.setItem("uikit-theme", "dark");

	applyStoredTheme();

	expect(theme()).toBe("dark");
});

it("выбранная светлая тема снимает атрибут", () => {
	document.documentElement.setAttribute("data-theme", "dark");
	localStorage.setItem("uikit-theme", "light");

	applyStoredTheme();

	expect(theme()).toBeNull();
});

// Пока выбора нет, идём за системной настройкой — в тестах она отвечает «светлая».
it("без выбора следует системной настройке", () => {
	applyStoredTheme();

	expect(theme()).toBeNull();
});

it("переживает недоступное хранилище", () => {
	const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("private mode");
	});

	try {
		expect(applyStoredTheme).not.toThrow();
		expect(theme()).toBeNull();
	} finally {
		getItem.mockRestore();
	}
});
