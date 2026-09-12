import { DOM } from "@brandup/ui";

/**
 * Theme switch in the example header.
 *
 * It shows what component inputs were made to reference the palette for: switching the theme is
 * an attribute on `<html>`, not a rebuild. The `theme.css` file declares the light theme in
 * `:root` and the dark one under `:root[data-theme="dark"]`, and the second block holds almost
 * nothing but the palette: input fill, the primary button, the toggle, the focus ring, the popup
 * and the dialog are all derived from it and follow along on their own.
 *
 * Until a choice is made, the page follows the system setting; a click makes the choice explicit
 * and remembers it. Applied by {@link applyStoredTheme} at the very start of the bundle.
 */
const STORAGE_KEY = "uikit-theme";
const DARK = "dark";
const LIGHT = "light";

// The reference to the query is kept in the module rather than created at the subscription site:
// the listener lives exactly as long as the `MediaQueryList` itself, and an object dropped right
// after `addEventListener` may be taken by the garbage collector together with the subscription —
// the theme would silently stop following the system.
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const isDark = (): boolean => document.documentElement.getAttribute("data-theme") === DARK;

const readChoice = (): string | null => {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		// private mode: we do not remember a choice — so there is none
		return null;
	}
};

const apply = (dark: boolean) => {
	if (dark) document.documentElement.setAttribute("data-theme", DARK);
	else document.documentElement.removeAttribute("data-theme");
};

export interface ThemeLabels {
	/** Подписи кнопки: каждая называет тему, на которую переключает. */
	toDark: string;
	toLight: string;
}

/**
 * Применяет сохранённый выбор темы к документу.
 *
 * Вызывается первой строкой приложения, до постройки чего бы то ни было: тема — это атрибут
 * на `<html>`, и чем раньше он встанет, тем меньше страница успеет показать чужую палитру.
 * Пока выбора нет, следуем системной настройке.
 */
export function applyStoredTheme(): void {
	const saved = readChoice();

	apply(saved ? saved === DARK : systemDark.matches);
}

/** Wires up the switch in the header. Called once at application start. */
export function initThemeSwitch(labels: ThemeLabels): void {
	const button = DOM.queryElement(document.body, "[data-theme-switch]");
	if (!button) return;

	const label = DOM.queryElement(button, "[data-theme-switch-label]");

	const refresh = () => {
		const dark = isDark();

		// The label is about where a click switches to, not about what is current: a button names
		// the action. The state is read by a screen reader — that is what `aria-pressed` is for
		// on a toggle.
		if (label) label.textContent = dark ? labels.toLight : labels.toDark;
		button.setAttribute("aria-pressed", dark ? "true" : "false");
	};

	button.addEventListener("click", () => {
		const dark = !isDark();
		apply(dark);

		try {
			// The choice is written in full rather than as "dark or nothing": an empty value would
			// mean "follow the system", and light chosen on a dark system would not survive
			// a reload.
			localStorage.setItem(STORAGE_KEY, dark ? DARK : LIGHT);
		} catch {
			// private mode: the theme stays chosen until a reload — better than throwing
		}

		refresh();
	});

	// The system setting is listened to only while no choice has been made: a choice made by hand
	// is stronger, and switching the theme under the user because their system went dark is wrong.
	systemDark.addEventListener("change", (e) => {
		if (readChoice()) return;

		apply(e.matches);
		refresh();
	});

	refresh();
}
