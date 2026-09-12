/**
 * Всё, чем контрол объявлен снаружи и в своей разметке: классы, команда, событие, подписи
 * и числа, на которые опирается поведение.
 *
 * Отдельным модулем и почти без импортов — так же во всех пакетах кита: имена нужны и самому
 * контролу, и его тестам, и потребителю, а модуль контрола тянет за собой стили, иконки
 * и половину кита. Ради одной строки класса это лишнее. Единственный импорт — реестр подписей
 * (`@brandup/ui-kit/i18n`): он сам без импортов и без побочных эффектов.
 *
 * Соглашение об именах — в `@brandup/ui-kit/names`.
 *
 * Одним объектом, а не россыпью констант: потребитель пишет `TEXTBOX.EVENT.CHANGE` и по пути
 * видит, что бывает рядом, а новое имя не разрастается в ещё один экспорт.
 */
import { declareTexts } from "@brandup/ui-kit/i18n";

declare module "@brandup/ui-kit/i18n" {
	interface KitTexts {
		/** Подписи текстового поля. */
		textbox: {
			/** Подпись кнопки копирования значения. */
			COPY: string;
		};
	}
}

export const TEXTBOX = {
	CLASS: {
		/** Корень контрола, поле-носитель под ним и миниатюра рядом с ним. */
		ROOT: "ui-textbox",
		INPUT: "ui-textbox-input",
		MINIATURE: "ui-textbox-miniature",
		/** Части разметки внутри корня. */
		ELEMENT: {
			DECORATOR: "decorator",
			EDITOR: "editor",
			ACTIONS: "actions",
			SYMBOLS: "symbols",
		},
		/** Состояния — их видят стили. */
		STATE: {
			MULTYLINE: "multyline",
			COUNTER: "counter",
			INVALID: "invalid",
			INCORRECT: "incorrect",
			SUCCESS: "success",
		},
	},
	/** Команда разметки — с префиксом кита, как `ui-popup-toggle` и `ui-modal-close`. */
	COMMAND: {
		COPY: "ui-textbox-copy",
	},
	/** События контрола: имя для `on` / `trigger`. */
	EVENT: {
		CHANGE: "ui:textbox:change",
	},
	/** Подписи по умолчанию — их переопределяет `setTexts` приложения (см. `@brandup/ui-kit/i18n`). */
	TEXT: declareTexts("textbox", {
		COPY: "Copy to clipboard",
	}),
	VALUE: {
		/** Предел длины адреса почты — https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3 */
		MAX_EMAIL_LENGTH: 256,
		/** Сколько держится подсветка отклонённого ввода, мс. */
		INCORRECT_DURATION: 200,
	},
} as const;
