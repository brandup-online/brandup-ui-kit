import { DOM } from "@brandup/ui";
import { CURRENT_LANG, LANGUAGE_STORAGE_KEY, type AppLanguage } from "./i18n";

/**
 * Переключалка языка в шапке примера.
 *
 * Показывает, как язык доходит до обеих сторон: тексты примера берутся из его словаря через
 * `@brandup/ui-i18n`, подписи контролов — из словарей пакетов через реестр кита (см. i18n.ts).
 *
 * Выбор пишется в хранилище и страница перезагружается. Это не упрощение, а свойство обоих
 * движков: неймспейс перевода регистрируется один раз за загрузку, а подпись контрола попадает
 * в разметку в момент его постройки — уже собранным контролам новый язык не достанется.
 */
export interface LanguageLabels {
	/** Подпись всей переключалки — уходит в `aria-label`. */
	title: string;
	toRu: string;
	toEn: string;
}

/** Язык, на который переключает кнопка: из двух это всегда другой. */
const nextLanguage = (): AppLanguage => (CURRENT_LANG === "ru" ? "en" : "ru");

/**
 * Подключает переключалку в шапке. Вызывается один раз при старте приложения.
 *
 * @param restart Чем начать страницу заново после выбора. По умолчанию перезагрузка — она и нужна
 * в браузере; параметром это вынесено потому, что переход jsdom не умеет вовсе, а проверить, что
 * страница действительно перезапускается, важнее, чем сэкономить аргумент.
 */
export function initLanguageSwitch(labels: LanguageLabels, restart: () => void = () => location.reload()): void {
	const button = DOM.queryElement(document.body, "[data-language-switch]");
	if (!button) return;

	const label = DOM.queryElement(button, "[data-language-switch-label]");
	const next = nextLanguage();

	// Кнопка названа языком, на который переключает, — как и кнопка темы рядом: подпись говорит
	// о действии, а не о текущем состоянии. Текущий язык виден по самой странице.
	if (label) label.textContent = next === "ru" ? labels.toRu : labels.toEn;
	button.setAttribute("aria-label", labels.title);
	button.setAttribute("lang", next);

	button.addEventListener("click", () => {
		try {
			// Выбор пишется полностью, а не «ru или ничего»: пустое значение означало бы
			// «как в документе», и выбранный английский не пережил бы перезагрузку.
			localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
		} catch {
			// приватный режим: выбор не запоминаем — тогда его и нет
		}

		// Атрибут ставим до перезапуска: если хранилище недоступно, язык хотя бы доживёт
		// до следующей отрисовки этой же страницы.
		document.documentElement.lang = next;
		restart();
	});
}
