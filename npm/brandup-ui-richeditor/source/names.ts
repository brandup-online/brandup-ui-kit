/**
 * Имена, которыми редактор объявлен снаружи и в своей разметке: классы поля, панели
 * форматирования и панели смайликов, событие и числа, на которые опирается поведение.
 *
 * Отдельным модулем и почти без импортов: имена делят между собой поле (`richeditor.ts`),
 * панель (`toolbar.ts`) и попап смайликов (`emoji.ts`), а его самого тянут к себе соседние
 * пакеты — поле сообщения и текстбокс ищут по `.ui-richeditor-toolbar` в своих кликах.
 * Единственный импорт — реестр подписей (`@brandup/ui-kit/i18n`): он сам без импортов
 * и без побочных эффектов.
 *
 * Соглашение об именах — в `@brandup/ui-kit/names`.
 *
 * Одним объектом, а не россыпью констант: потребитель пишет `RICHEDITOR.EVENT.CHANGE` и по пути
 * видит, что бывает рядом, а новое имя не разрастается в ещё один экспорт.
 */
import { declareTexts } from "@brandup/ui-kit/i18n";

declare module "@brandup/ui-kit/i18n" {
	interface KitTexts {
		/** Подписи редактора: типы блоков, инструменты форматирования, панель и группы смайликов. */
		richeditor: {
			/** Типы блоков в панели. */
			BLOCK_PARAGRAPH: string;
			BLOCK_QUOTE: string;
			BLOCK_CODE: string;
			/** Инструменты форматирования. */
			BOLD: string;
			ITALIC: string;
			STRIKE: string;
			UNDERLINE: string;
			SPOILER: string;
			CODE: string;
			LINK: string;
			/**
			 * Подпись сведённой кнопки кода: моноширинный и блок кода панель показывает одной
			 * кнопкой, и называется она короче обоих.
			 */
			CODE_MERGED: string;
			/** Действия панели. */
			EMOJI: string;
			ERASE: string;
			UNDO: string;
			REDO: string;
			/** Кнопки поля адреса в панели. */
			LINK_APPLY: string;
			LINK_REMOVE: string;
			/**
			 * Названия групп смайликов. В панели не показываются, уходят в подпись для скринридера
			 * (см. `aria-label` группы).
			 */
			EMOJI_SMILEYS: string;
			EMOJI_PEOPLE: string;
			EMOJI_ANIMALS: string;
			EMOJI_NATURE: string;
			EMOJI_FOOD: string;
			EMOJI_CELEBRATION: string;
			EMOJI_PLACES: string;
			EMOJI_TRANSPORT: string;
			EMOJI_OBJECTS: string;
			EMOJI_SYMBOLS: string;
			/** Группа недавно вставленных: собирается на лету, поэтому стоит особняком. */
			EMOJI_RECENT: string;
		};
	}
}

export const RICHEDITOR = {
	CLASS: {
		/** Редактируемый элемент — к нему привязан `UIElement`. */
		ROOT: "ui-richeditor",
		/**
		 * Содержимое временно невыделяемо: по странице тянут выделение, начатое вне редактора
		 * (см. `__holdSelectable`).
		 */
		UNSELECTABLE: "unselectable",
		/** Режим мягких переносов: абзац — это строка, и отступов между абзацами в нём нет. */
		BREAKS: "breaks",
		/** Панель форматирования — общая на все редакторы страницы. */
		TOOLBAR: {
			/** Обёртка панели: её позиционируют, вид и содержимое держит коробка внутри. */
			ROOT: "ui-richeditor-toolbar",
			/** Коробка с кнопками внутри обёртки: её размер точку привязки не трогает. */
			BODY: "toolbar-body",
			/**
			 * Общий класс всех кнопок панели: им они и оформляются. Свой класс у каждой остаётся —
			 * по нему кнопку находят, а один на всех оформлять удобнее, чем перечислять их в стилях.
			 */
			BUTTON: "toolbar-button",
			/**
			 * Строка ввода адреса ссылки и состояние панели, пока её правят: ссылка — единственный
			 * инструмент с данными, и панель показывает поле адреса вместо кнопок.
			 */
			LINK_ROW: "link-row",
			LINK_EDITING: "link-editing",
		},
		/** Попап вставки смайлика: он же `.ui-popup` кита. */
		EMOJI: {
			/** Попап целиком: у каждого владельца свой, собираются они общей `createEmojiPicker`. */
			PICKER: "ui-richeditor-emoji",
			GROUP: "emoji-group",
			LIST: "emoji-list",
			ITEM: "emoji",
			/**
			 * Группа недавних: стоит первой и пересобирается из хранилища при каждом открытии.
			 * Метка для поиска, а не оформление — вид у неё общий с остальными группами.
			 */
			RECENT_GROUP: "emoji-recent",
		},
	},
	/** События редактора: имя для `on` / `trigger`. */
	EVENT: {
		CHANGE: "ui:richeditor:change",
	},
	/** Ключи в `localStorage` — общие для всех редакторов страницы. */
	STORAGE: {
		/** Список недавних смайликов — один на все попапы источника. */
		RECENT_EMOJIS: "brandup-richeditor-recent-emojis",
	},
	VALUE: {
		/**
		 * Сколько кнопок помещается в ряд при ширине панели (см. `.ui-richeditor-emoji`
		 * в richeditor.less). Точность нужна только для оценки высоты нерисованной группы.
		 */
		EMOJI_COLUMNS: 8,
		/** Сколько недавних хранится и показывается: два ряда панели. */
		RECENT_EMOJIS_LIMIT: 16,
		/**
		 * Максимальное отставание события `change` от печати. Сериализация значения — самая дорогая
		 * операция редактора (обход всего содержимого), а печать даёт `input` на каждый символ.
		 * Это троттлинг, а не debounce: при непрерывном наборе значение всё равно обновляется
		 * каждые эти миллисекунды, а не откладывается до паузы.
		 */
		CHANGE_THROTTLE_MS: 150,
		/**
		 * Зазор от краёв экрана у панели в `document.body`. То же значение вычитается из её
		 * предельной ширины в richeditor.less (`--richeditor-toolbar-edge-gap`) — менять их
		 * нужно вместе.
		 */
		TOOLBAR_EDGE_GAP: 4,
		/** Отступ панели от поля, над которым она встаёт. */
		TOOLBAR_MARGIN: 6,
	},
	/**
	 * Подписи по умолчанию — их переопределяет `setTexts` приложения (см. `@brandup/ui-kit/i18n`).
	 * Пояснение к каждой — там же, у объявления неймспейса.
	 */
	TEXT: declareTexts("richeditor", {
		BLOCK_PARAGRAPH: "Plain text",
		BLOCK_QUOTE: "Quote",
		BLOCK_CODE: "Code block",
		BOLD: "Bold",
		ITALIC: "Italic",
		STRIKE: "Strikethrough",
		UNDERLINE: "Underline",
		SPOILER: "Spoiler",
		CODE: "Monospace",
		LINK: "Link",
		CODE_MERGED: "Code",
		EMOJI: "Insert an emoji",
		ERASE: "Clear the formatting",
		UNDO: "Undo (Ctrl+Z)",
		REDO: "Redo (Ctrl+Y)",
		LINK_APPLY: "Apply",
		LINK_REMOVE: "Remove the link",
		EMOJI_SMILEYS: "Smileys and gestures",
		EMOJI_PEOPLE: "People",
		EMOJI_ANIMALS: "Animals",
		EMOJI_NATURE: "Nature",
		EMOJI_FOOD: "Food",
		EMOJI_CELEBRATION: "Celebrations and sport",
		EMOJI_PLACES: "Places",
		EMOJI_TRANSPORT: "Transport",
		EMOJI_OBJECTS: "Objects",
		EMOJI_SYMBOLS: "Symbols",
		EMOJI_RECENT: "Recent",
	}),
} as const;
