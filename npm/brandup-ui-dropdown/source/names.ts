/**
 * Всё, чем контрол объявлен снаружи и в своей разметке: классы, команды, события, подписи
 * по умолчанию и числа, на которые опирается поведение.
 *
 * Отдельным модулем и почти без импортов — так же во всех пакетах кита: имена нужны и самому
 * контролу, и его тестам, и потребителю, а модуль контрола тянет за собой стили, иконки
 * и половину кита. Ради одной строки класса это лишнее. Единственный импорт — реестр подписей
 * (`@brandup/ui-kit/i18n`): он сам без импортов и без побочных эффектов.
 *
 * Соглашение об именах — в `@brandup/ui-kit/names`.
 *
 * Одним объектом, а не россыпью констант: потребитель пишет `DROPDOWN.COMMAND.CLOSE` и по пути
 * видит, что бывает рядом, а новое имя не разрастается в ещё один экспорт.
 */
import { declareTexts } from "@brandup/ui-kit/i18n";

declare module "@brandup/ui-kit/i18n" {
	interface KitTexts {
		/** Подписи выпадающего списка. */
		dropdown: {
			/** Заглушка кнопки показа, пока значение не выбрано. */
			PLACEHOLDER: string;
			/** Текст вместо пустого списка. */
			EMPTY: string;
			/** Заглушка строки поиска. */
			SEARCH: string;
			/** Текст, когда поиск ничего не нашёл. */
			SEARCH_EMPTY: string;
			/** Подпись кнопки отмены выбора. */
			CANCEL: string;
		};
	}
}

export const DROPDOWN = {
	CLASS: {
		/** Корень контрола, поле-носитель под ним и миниатюра выбранного значения. */
		ROOT: "ui-dropdown",
		INPUT: "ui-dropdown-input",
		MINIATURE: "ui-dropdown-miniature",
		/** На `body`, пока список раскрыт: страница под ним не прокручивается (см. dropdown.less). */
		BODY: "body-dropdown-opened",
		/** Части разметки внутри корня. */
		ELEMENT: {
			POPUP: "ui-dropdown-popup",
			CONTENT: "content",
			HEADER: "header",
			SEARCH: "search",
			VIEW: "view",
			CANCEL: "cancel",
			EMPTY: "empty",
		},
		/** Состояния — их видят стили. */
		STATE: {
			EXPANDED: "expanded",
			HAS_VALUE: "hasvalue",
			EMPTY: "empty",
			SEARCHABLE: "searchable",
			INVALID: "invalid",
			RESULT: "result",
			NOT_FOUND: "notfound",
			MATCH: "ok",
			TOP: "top",
			RIGHT: "right",
		},
	},
	/** Команды разметки — с префиксом кита, как `ui-popup-toggle` и `ui-modal-close`. */
	COMMAND: {
		TOGGLE: "ui-dropdown-toggle",
		CLOSE: "ui-dropdown-close",
		SELECT: "ui-dropdown-select",
	},
	/** События контрола: имя для `on` / `trigger`. */
	EVENT: {
		CHANGE: "ui:dropdown:change",
	},
	/**
	 * Подписи по умолчанию: каждую переопределяет свой `data-*` на самом контроле (см. README),
	 * а для всего приложения — `setTexts` (см. `@brandup/ui-kit/i18n`).
	 */
	TEXT: declareTexts("dropdown", {
		PLACEHOLDER: "Select",
		EMPTY: "Empty list",
		SEARCH: "Search",
		SEARCH_EMPTY: "Not found",
		CANCEL: "Cancel",
	}),
	VALUE: {
		/** Со скольких пунктов показывается строка поиска (переопределяется `data-search-on`). */
		SEARCH_ON: 15,
		/** Предел длины поискового запроса. */
		SEARCH_MAX_LENGTH: 50,
		/** Ниже этой ширины список раскрывается во весь экран — парно с `@adaptive-tablet`. */
		TABLET_WIDTH: 1030,
		/** Отступ списка от кнопки показа — тот же, что в `transform: translateY()` у `.ui-dropdown-popup`. */
		POPUP_GAP: 8,
	},
	/** Префикс идентификатора списка: по нему кнопка показа ссылается на него (`aria-controls`). */
	LIST_ID: "ui-dropdown-list-",
} as const;
