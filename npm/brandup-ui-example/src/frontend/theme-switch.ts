import { DOM } from "@brandup/ui";

/**
 * Переключатель темы в шапке примера.
 *
 * Показывает то, ради чего входы компонентов стали ссылаться на палитру: смена темы — это
 * атрибут на `<html>`, а не пересборка. Файл `theme.css` объявляет светлую тему в `:root`,
 * тёмную — под `:root[data-theme="dark"]`, и во втором блоке лежит почти одна палитра:
 * заливка полей, главная кнопка, переключатель, кольцо фокуса, попап и окно выведены из неё
 * и едут следом сами.
 *
 * Выбор запоминается, а применяет его к первой отрисовке скрипт в шапке документа — иначе
 * страница мигала бы светлым у того, кто выбрал тёмную.
 */
const STORAGE_KEY = "uikit-theme";
const DARK = "dark";

const isDark = (): boolean => document.documentElement.getAttribute("data-theme") === DARK;

const apply = (dark: boolean) => {
	if (dark) document.documentElement.setAttribute("data-theme", DARK);
	else document.documentElement.removeAttribute("data-theme");

	try {
		if (dark) localStorage.setItem(STORAGE_KEY, DARK);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// приватный режим: тема останется выбранной до перезагрузки, и это лучше, чем падение
	}
};

/** Подписывает переключатель в шапке. Зовётся один раз при старте приложения. */
export function initThemeSwitch(): void {
	const button = DOM.queryElement(document.body, "[data-theme-switch]");
	if (!button) return;

	const label = DOM.queryElement(button, "[data-theme-switch-label]");

	const refresh = () => {
		const dark = isDark();

		// Подпись — про то, куда переключит нажатие, а не про то, что сейчас: кнопка называет
		// действие. Состояние читает скринридер — `aria-pressed` у переключателя для того и есть.
		if (label) label.textContent = dark ? "Светлая тема" : "Тёмная тема";
		button.setAttribute("aria-pressed", dark ? "true" : "false");
	};

	button.addEventListener("click", () => {
		apply(!isDark());
		refresh();
	});

	refresh();
}
