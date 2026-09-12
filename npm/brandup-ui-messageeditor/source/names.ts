/**
 * Всё, чем поле сообщения объявлено снаружи и в своей разметке: классы плашки, разметки
 * конструкций и окон, команды, событие, подписи и числа, на которые опирается поведение.
 *
 * Отдельным модулем и почти без импортов — так же во всех пакетах кита: имена делят между собой
 * плашка (`messageeditor.ts`), подсветка конструкций (`highlight.ts`) и окна персонализации
 * и рандомизации, а модуль самой плашки тянет за собой стили, иконки и редактор. Единственный
 * импорт — реестр подписей (`@brandup/ui-kit/i18n`): он сам без импортов и без побочных эффектов.
 *
 * Соглашение об именах — в `@brandup/ui-kit/names`.
 *
 * Одним объектом, а не россыпью констант: потребитель пишет `MESSAGEEDITOR.EVENT.CHANGE` и по пути
 * видит, что бывает рядом, а новое имя не разрастается в ещё один экспорт.
 */
import { declareTexts } from "@brandup/ui-kit/i18n";

declare module "@brandup/ui-kit/i18n" {
	interface KitTexts {
		/** Подписи поля сообщения, окон персонализации и рандомизации. */
		messageeditor: {
			/** Подпись и подсказка кнопки показа самого сообщения. */
			MODE_TEXT: string;
			MODE_TEXT_TITLE: string;
			/**
			 * Подпись и подсказка кнопки показа разметки. Подпись — название разметки, знакомое
			 * пишущему («Markdown»): формат хранения (STORAGE) решает, как значение сериализуется,
			 * а не как называется кнопка, — сменится он, и подпись придётся выбирать заново.
			 */
			MODE_SOURCE: string;
			MODE_SOURCE_TITLE: string;
			/** Подсказка кнопки вставки смайлика. */
			EMOJI: string;
			/** Подсказка кнопки вставки свойства. */
			VARIABLE_INSERT: string;
			/** Подсказка кнопки рандомизации и заголовок её окна. */
			RANDOMIZE: string;
			/** Заглушка поля варианта в окне рандомизации. */
			VARIANT_PLACEHOLDER: string;
			/** Подсказка кнопки удаления варианта. */
			VARIANT_REMOVE: string;
			/** Заглушка поля ключа в окне правки свойства. */
			VARIABLE_KEY_PLACEHOLDER: string;
			/** Подписи кнопок в окнах: сохранить и отменить. */
			SAVE: string;
			CANCEL: string;
			/** Подсказка на неизвестном свойстве: почему оно выделено не так, как остальные. */
			UNKNOWN_TITLE: string;
			/**
			 * Подпись невалидности поля-носителя, когда в тексте есть необъявленные свойства:
			 * её показывает браузер при попытке отправить форму. `{keys}` — перечисление
			 * необъявленных конструкций через запятую.
			 */
			UNKNOWN_ERROR: string;
			/** Подсказка на новом свойстве: почему оно выделено не так, как объявленные. */
			NEW_TITLE: string;
			/**
			 * Пометка на записи свойства, которого ещё нет в объявленном списке: набрано в сообщении,
			 * а заведёт его приложение (см. режим новых свойств у `MessageEditor`).
			 */
			VARIABLE_NEW: string;
			/**
			 * Заголовок окон персонализации — и списка, и правки ключа: для набирающего это одно окно
			 * про одно и то же, а разные заголовки читались бы как разные части приложения.
			 */
			VARIABLES_TITLE: string;
			/**
			 * Текст в окне, когда список свойств пуст. Заменяется на свой: причина пустого списка
			 * известна приложению, а не компоненту («выберите аудиторию», «у этого шаблона свойств нет»).
			 */
			VARIABLES_EMPTY: string;
			/** Подпись ссылки на настройку полей — когда хост её объявил, но подпись не задал. */
			VARIABLES_SETUP: string;
			/**
			 * Подсказка под полем ключа: какой ключ примут. Стоит всегда, а не только при ошибке, —
			 * это правило, а не жалоба: набирающий видит его до того, как кнопка погаснет.
			 */
			VARIABLE_KEY_HINT: string;
		};
	}
}

export const MESSAGEEDITOR = {
	CLASS: {
		/** Корень контрола. */
		ROOT: "ui-messageeditor",
		/**
		 * Поле-носитель, уведённое с экрана. Имя полное, как у корня: его пишет в разметке хост —
		 * чтобы поле не мелькало до инициализации, — и оформляет правилом верхнего уровня.
		 */
		INPUT: "ui-messageeditor-input",
		/** Части разметки контрола: имена короткие — их всегда пишут внутри корня. */
		ELEMENT: {
			/** Плашка сообщения — коробка вокруг поля и кнопки смайликов. */
			BUBBLE: "bubble",
			/**
			 * Кнопка вставки смайлика. Не `emoji`: так называются сами смайлики в панели,
			 * а она раскрывается тут же, внутри корня.
			 */
			EMOJI: "emoji-button",
			/** Коробка кнопки: панель раскрывается от неё, поэтому она и позиционирована. */
			EMOJI_HOLDER: "emoji-holder",
			/** Переключатель режимов перед плашкой и кнопка в нём. */
			MODES: "modes",
			MODE: "mode",
			/** Панель источника вместо плашки и прокручиваемый текст внутри неё. */
			SOURCE: "source",
			SOURCE_TEXT: "source-text",
		},
		/** Состояния корневого элемента — их видят стили. */
		STATE: {
			/**
			 * Показан источник сообщения, а не плашка. На корневом элементе — как `focused`
			 * и `invalid`, но только для оформления: сам режим компонент держит в себе
			 * и из класса не читает (см. `sourceMode`).
			 *
			 * Не `source`: так зовётся сама панель, и на одном дереве два разных `.source`
			 * читались бы как один.
			 */
			SOURCE_MODE: "source-mode",
			/** Нажатая кнопка режима в переключателе. */
			ACTIVE: "active",
			/** Значение не прошло проверку — ставится по итогу `validate()`. */
			INVALID: "invalid",
		},
		/**
		 * Разметка конструкций внутри текста: её ставит подсветка и по ней же её потом снимают.
		 * `MARK` и `LABEL` — части свойства: скобки и имя.
		 */
		MARKUP: {
			SPINTAX: "spintax",
			VARIABLE: "variable",
			/** Ключ свойства внутри обёртки: на экране его подменяет название, но в тексте он остаётся. */
			KEY: "key",
			/** Символ самой конструкции — скобка или разделитель вариантов: оформляется отдельно от содержимого. */
			MARK: "mark",
			/** Пустая обёртка подписи: название выводится её оформлением, а не текстом (см. `buildMarkup`). */
			LABEL: "label",
			/** Свойство с ключом, которого нет в объявленном списке, — в строгом режиме это ошибка. */
			UNKNOWN: "unknown",
			/** То же в режиме новых свойств: не ошибка, а ещё не заведённое свойство. */
			NEW: "new",
		},
		/** Разметка окон персонализации и рандомизации. */
		MODAL: {
			/**
			 * Сами окна: они живут в `body`, а не внутри контрола, поэтому имя полное —
			 * коротким его на странице не отличить от чужого.
			 */
			ROOT: {
				RANDOMIZER: "ui-messageeditor-randomizer",
				VARIABLES: "ui-messageeditor-variables",
				VARIABLE_KEY: "ui-messageeditor-variable-key",
			},
			/** Части внутри окна — короткие имена, как и у самого контрола. */
			ELEMENT: {
				ACTIONS: "actions",
				APPLY: "apply",
				CANCEL: "cancel",
				REMOVE: "remove",
				VARIANTS: "variants",
				VARIANT: "variant",
				LIMIT: "limit",
				MAX_VARIANTS: "max-variants",
				VARIABLES: "variables",
				PREVIEW: "preview",
				NOTE: "note",
				HINT: "hint",
				KEY_FIELD: "key-field",
				SETUP: "setup",
				SETUP_LINK: "setup-link",
				EMPTY: "empty",
			},
		},
	},
	/** Команды разметки окон — с префиксом кита, как `ui-popup-toggle` и `ui-modal-close`. */
	COMMAND: {
		RANDOMIZER: {
			REMOVE: "ui-randomizer-remove",
			APPLY: "ui-randomizer-apply",
			CANCEL: "ui-randomizer-cancel",
		},
		VARIABLES: {
			PICK: "ui-variables-pick",
		},
		VARIABLE_KEY: {
			APPLY: "ui-variable-key-apply",
			CANCEL: "ui-variable-key-cancel",
		},
	},
	/** События контрола: имя для `on` / `trigger`. */
	EVENT: {
		CHANGE: "ui:messageeditor:change",
	},
	/** Подписи, зашитые в разметку. */
	/**
	 * Подписи по умолчанию — их переопределяет `setTexts` приложения (см. `@brandup/ui-kit/i18n`).
	 * Пояснение к каждой — там же, у объявления неймспейса.
	 */
	TEXT: declareTexts("messageeditor", {
		MODE_TEXT: "Text",
		MODE_TEXT_TITLE: "Show the message",
		MODE_SOURCE: "Markdown",
		MODE_SOURCE_TITLE: "Show the markup the value is submitted as",
		EMOJI: "Insert an emoji",
		VARIABLE_INSERT: "Insert a property",
		RANDOMIZE: "Randomize the text",
		VARIANT_PLACEHOLDER: "Text variant",
		VARIANT_REMOVE: "Remove the variant",
		VARIABLE_KEY_PLACEHOLDER: "Property key",
		SAVE: "Save",
		CANCEL: "Cancel",
		UNKNOWN_TITLE: "The property is not declared and will not be substituted on submit.",
		UNKNOWN_ERROR: "Unknown properties: {keys}.",
		NEW_TITLE: "A new property, not in the list yet.",
		VARIABLE_NEW: "new",
		VARIABLES_TITLE: "Personalization",
		VARIABLES_EMPTY: "No properties are set.",
		VARIABLES_SETUP: "Set up the fields",
		VARIABLE_KEY_HINT:
			"A key starts and ends with a letter, a digit or an underscore; inside it can have spaces, dots and hyphens.",
	}),
	/** Символы, из которых собираются конструкции сообщения. */
	SYNTAX: {
		SPINTAX_OPEN: "[",
		SPINTAX_CLOSE: "]",
		SPINTAX_SEPARATOR: "|",
		VARIABLE_OPEN: "{",
		VARIABLE_CLOSE: "}",
		/**
		 * Символ нулевой ширины, которым конструкция заканчивает строку: им подсветка держит место
		 * для каретки рядом с конструкцией. В значение не идёт — его снимает хост, читая значение
		 * (см. `MessageEditor`).
		 */
		CARET_ANCHOR: "​",
	},
	VALUE: {
		/** Сколько символов отводится свойству при подсчёте длины, пока хост не задал своего. */
		DEFAULT_VARIABLE_LENGTH: 30,
		/**
		 * Предел на число вариантов в окне рандомизации. Спинтакс уходит в текст сообщения целиком,
		 * и разрастаться ему некуда: длинный набор нечитаем в поле и незачем — вариант всё равно
		 * выбирается один.
		 */
		MAX_VARIANTS: 30,
	},
} as const;
