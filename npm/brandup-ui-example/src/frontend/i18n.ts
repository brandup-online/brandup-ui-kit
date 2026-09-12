import { createI18n, type LocaleNamespace } from "@brandup/ui-i18n";
import { setTexts } from "@brandup/ui-kit/i18n";

/**
 * Язык примера: и его собственная оболочка, и подписи контролов кита.
 *
 * Два движка, потому что задачи разные. `@brandup/ui-i18n` отвечает за тексты приложения: он
 * разрешает язык и лениво грузит словари под него. Реестр кита (`@brandup/ui-kit/i18n`) отвечает
 * за подписи контролов: пакеты поставляются с английскими, а приложение объявляет свои. Связаны
 * они одним вызовом {@link applyLanguage} — результат первого уходит во второй.
 *
 * Язык берётся из `<html lang>`: сохранённый выбор применяется к документу здесь же, при загрузке
 * модуля, а переключалка в шапке пишет его и перезагружает страницу (см. language-switch.ts).
 * Перезагрузка здесь не от лени: подпись попадает в разметку в момент
 * постройки контрола, а неймспейс перевода регистрируется один раз — оба движка рассчитаны
 * на один язык за загрузку.
 */
export type AppLanguage = "ru" | "en";

/** Тексты примера: строка берётся лямбдой — `texts.t(m => m.nav.home)`. */
export type AppTexts = LocaleNamespace<AppLocaleModel>;

export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ["ru", "en"];

/**
 * Английский по умолчанию — тот же выбор, что у пакетов кита: на нём же стоит фолбэк перевода,
 * и непереведённый ключ покажется по-английски, а не путём до себя.
 *
 * Языком первого показа он не управляет: его задаёт `<html lang>` (см. template.html), и пока
 * там стоит `ru`, пример открывается по-русски, а английский приходит переключалкой.
 */
export const DEFAULT_LANGUAGE: AppLanguage = "en";

/**
 * Ключ хранения выбранного языка. Живёт здесь, а не у переключалки: выбор обязан примениться
 * до того, как движок прочитает язык, а читает он его при загрузке этого модуля.
 */
export const LANGUAGE_STORAGE_KEY = "uikit-lang";

const isLanguage = (value: string | null): value is AppLanguage =>
	!!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

// Выбор применяется к документу до разрешения языка: `<html lang>` — единственный вход движка,
// и он же говорит браузеру, на каком языке страница.
const applyStoredLanguage = () => {
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
	} catch {
		// приватный режим: выбор не запомнен — остаётся язык документа
	}

	if (isLanguage(saved)) document.documentElement.lang = saved;
};

applyStoredLanguage();

const i18n = createI18n<AppLanguage>({
	lang: document.documentElement.lang,
	supported: SUPPORTED_LANGUAGES,
	default: DEFAULT_LANGUAGE,
});

export const { CURRENT_LANG } = i18n;

/**
 * Выбирает содержимое под текущий язык: грузится только оно, остальные языки в бандл не попадают
 * (webpack режет динамический импорт на отдельные куски).
 *
 * Этим страницы подключают свою разметку: прозы в ней на страницу по абзацу-двум, и вести её
 * ключами значило бы разбирать вёрстку на словарь. Языка без своего файла нет — берётся
 * содержимое языка по умолчанию.
 */
export async function pickContent<T>(loaders: Partial<Record<AppLanguage, () => Promise<{ default: T }>>>): Promise<T> {
	const loader = loaders[CURRENT_LANG] ?? loaders[DEFAULT_LANGUAGE];
	if (!loader) throw new Error(`Not found content for language "${CURRENT_LANG}".`);

	return (await loader()).default;
}

/** Тексты оболочки примера: шапка и её переключалки. */
export interface AppLocaleModel {
	nav: {
		home: string;
	};
	theme: {
		toDark: string;
		toLight: string;
	};
	language: {
		title: string;
		/** Подпись кнопки — язык, на который она переключает. */
		toRu: string;
		toEn: string;
	};
	/** Тексты, которые страницы строят в коде: разметка страниц живёт в своих файлах на язык. */
	demo: {
		modal: {
			helloTitle: string;
			helloBody: string;
			close: string;
			question: string;
			yes: string;
			no: string;
			answerYes: string;
			answerNo: string;
			layersTitle: string;
			layersBody: string;
			menu: string;
			item1: string;
			item2: string;
			/** `{count}` — сколько слоёв в стеке. */
			depth: string;
			/** `{number}` — номер строки-наполнителя. */
			line: string;
		};
		richeditor: {
			reset: string;
			yes: string;
			no: string;
			empty: string;
		};
		messageeditor: {
			empty: string;
			/** `{keys}` — перечисление ключей, которые предстоит завести. */
			toCreate: string;
			setup: string;
			/** Свойства персонализации: их знает приложение, а не компонент. */
			nameKey: string;
			nameTitle: string;
			surnameKey: string;
			surnameTitle: string;
			cityKey: string;
			cityTitle: string;
			companyKey: string;
			companyTitle: string;
		};
	};
	/** Заголовки страниц: их рисует общая шапка страницы (см. pages/base.ts). */
	pages: {
		index: string;
		styles: string;
		inputs: string;
		buttons: string;
		popups: string;
		modal: string;
		textbox: string;
		richeditor: string;
		messageeditor: string;
		dropdown: string;
		notfound: string;
		error: string;
	};
}

/**
 * Готовит язык: словарь оболочки и подписи контролов кита.
 *
 * Словари кита нужны только русскому — английский и есть то, с чем пакеты поставляются.
 * Грузятся они вместе с переводом оболочки, поэтому в английской сборке в бандл не попадают.
 */
export async function applyLanguage(): Promise<LocaleNamespace<AppLocaleModel>> {
	const localize = await i18n.buildLocalization<AppLocaleModel>("app", (builder) =>
		builder.add("ru", () => import("./locale/ru.json")).add("en", () => import("./locale/en.json"))
	);

	if (CURRENT_LANG === "ru") {
		const kit = await Promise.all([
			import("@brandup/ui-kit/locale/ru.json"),
			import("@brandup/ui-dropdown/locale/ru.json"),
			import("@brandup/ui-textbox/locale/ru.json"),
			import("@brandup/ui-richeditor/locale/ru.json"),
			import("@brandup/ui-messageeditor/locale/ru.json"),
		]);

		kit.forEach((dictionary) => setTexts(dictionary.default));
	}

	// Возвращается сам неймспейс, а не разобранная модель: строку берут лямбдой там, где она
	// нужна (`t(m => m.pages.dropdown)`), и новый текст не приходится проводить через это место.
	return localize;
}
