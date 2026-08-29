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
 * Пока выбор не сделан, страница идёт за системной настройкой; нажатие делает выбор явным
 * и запоминает его. К первой отрисовке всё это применяет встроенный в `<head>` скрипт —
 * иначе страница мигала бы светлым у того, кому нужна тёмная.
 */
const STORAGE_KEY = "uikit-theme";
const DARK = "dark";
const LIGHT = "light";

// Ссылку на запрос держим в модуле, а не создаём её на месте подписки: слушатель живёт ровно
// столько, сколько живёт сам `MediaQueryList`, и брошенный сразу после `addEventListener`
// объект сборщик мусора вправе унести вместе с подпиской — тема молча перестанет следовать
// за системой.
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const isDark = (): boolean => document.documentElement.getAttribute("data-theme") === DARK;

const readChoice = (): string | null => {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		// приватный режим: выбора не помним — значит его и нет
		return null;
	}
};

const apply = (dark: boolean) => {
	if (dark) document.documentElement.setAttribute("data-theme", DARK);
	else document.documentElement.removeAttribute("data-theme");
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
		const dark = !isDark();
		apply(dark);

		try {
			// Пишем выбор целиком, а не «тёмную или ничего»: пустое значение означало бы
			// «идти за системой», и выбранная светлая на тёмной системе не пережила бы
			// перезагрузку.
			localStorage.setItem(STORAGE_KEY, dark ? DARK : LIGHT);
		} catch {
			// приватный режим: тема останется выбранной до перезагрузки — это лучше падения
		}

		refresh();
	});

	// Системную настройку слушаем, только пока выбор не сделан: сделанный руками он сильнее,
	// и переключать тему под пользователем, потому что у него стемнело в системе, нельзя.
	systemDark.addEventListener("change", (e) => {
		if (readChoice()) return;

		apply(e.matches);
		refresh();
	});

	refresh();
}
