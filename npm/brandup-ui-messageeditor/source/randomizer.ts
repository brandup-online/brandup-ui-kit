import "./randomizer.less"; // стили окна

import { DOM } from "@brandup/ui";
import { Modal, textTag } from "@brandup/ui-kit";
import { MESSAGEEDITOR } from "./names";
import trashIcon from "../svg/trash.svg";

// Символы самой конструкции: внутри варианта они развалили бы её, поэтому не вводятся и не вставляются
const FORBIDDEN_KEYS: string[] = [
	MESSAGEEDITOR.SYNTAX.SPINTAX_OPEN,
	MESSAGEEDITOR.SYNTAX.SPINTAX_CLOSE,
	MESSAGEEDITOR.SYNTAX.SPINTAX_SEPARATOR,
];
const FORBIDDEN_CHARS = /[[\]|]/g;

/**
 * Приводит текст к годному варианту: в одну строку и без символов конструкции. Одни правила
 * на все пути текста в вариант — вставку и исходное выделение: ввод их держит клавишами,
 * а текст со стороны обязан пройти ту же чистку, иначе спинтакс развалился бы ими изнутри.
 */
function cleanVariant(text: string): string {
	return text
		.split(/\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" ")
		.replace(FORBIDDEN_CHARS, "");
}

/**
 * Конструктор рандомизации: список вариантов, из которых собирается спинтакс `[раз|два]`.
 * Варианты вводятся вручную — подбор синонимов остаётся на стороне приложения.
 *
 * Список ведёт себя как набор строк, а не как форма: пока есть место, он кончается пустым
 * вариантом — в него набирают следующий, и как только он перестаёт быть пустым, снизу
 * появляется новый. Опустевший вариант исчезает сам, когда из него уходят.
 *
 * Значения живут прямо в разметке, отдельного списка в памяти нет: строки правятся по одной,
 * и перерисовка всего списка на каждый символ сбивала бы каретку.
 */
export default class RandomizerModal extends Modal {
	private readonly __apply: (spintax: string) => void;
	private readonly __list: HTMLElement;
	private readonly __applyButton: HTMLButtonElement;

	override get typeName(): string {
		return "BrandUp.MessageEditor.Randomizer";
	}

	/**
	 * @param text Выделенный текст: становится первым вариантом. Если это уже спинтакс — разбирается на варианты.
	 * @param apply Вызывается с готовым спинтаксом; при отмене не вызывается.
	 */
	constructor(text: string, apply: (spintax: string) => void) {
		super({ title: MESSAGEEDITOR.TEXT.RANDOMIZE, className: MESSAGEEDITOR.CLASS.MODAL.ROOT.RANDOMIZER });

		this.__apply = apply;
		this.__list = DOM.tag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.VARIANTS });
		this.__applyButton = DOM.tag(
			"button",
			{
				type: "button",
				class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.APPLY,
				command: MESSAGEEDITOR.COMMAND.RANDOMIZER.APPLY,
			},
			MESSAGEEDITOR.TEXT.SAVE
		) as HTMLButtonElement;

		// Правка разбирается на списке, а не на каждом поле: строки появляются и исчезают на ходу,
		// и слушатели пришлось бы вешать каждой. blur не всплывает — его берём в перехвате.
		this.__list.addEventListener("keydown", (e) => this.__onFieldKeyDown(e));
		this.__list.addEventListener("paste", (e) => this.__onFieldPaste(e));
		this.__list.addEventListener("input", () => this.__refresh());
		this.__list.addEventListener("blur", (e) => this.__onFieldBlur(e), true);
		// Перетащенный текст миновал бы и клавиши, и вставку — со скобками и переносами внутри
		// варианта. Своей чистке событие не поддаётся так же просто, как вставка (браузер сам
		// решает, куда встанет текст), поэтому бросать в вариант нельзя вовсе.
		this.__list.addEventListener("drop", (e) => {
			if (fieldOf(e.target)) e.preventDefault();
		});

		this.body.appendChild(this.__list);
		this.body.appendChild(
			// сохранение первым: это главное действие окна, отмена рядом вторым
			DOM.tag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.ACTIONS }, [
				this.__applyButton,
				DOM.tag(
					"button",
					{
						type: "button",
						class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.CANCEL,
						command: MESSAGEEDITOR.COMMAND.RANDOMIZER.CANCEL,
					},
					MESSAGEEDITOR.TEXT.CANCEL
				),
				DOM.tag(
					"div",
					{ class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.LIMIT },
					`Не больше ${MESSAGEEDITOR.VALUE.MAX_VARIANTS} вариантов.`
				),
			])
		);

		this.registerCommand(MESSAGEEDITOR.COMMAND.RANDOMIZER.REMOVE, (context) => {
			context.target.closest(".variant")?.remove();
			this.__refresh();
		});

		this.registerCommand(MESSAGEEDITOR.COMMAND.RANDOMIZER.APPLY, () => {
			// пустые варианты не несут смысла: `[раз||два]` даёт пустую подстановку
			const variants = this.__variants();
			if (!variants.length) return;

			this.__apply(buildSpintax(variants));
			this.close();
		});

		this.registerCommand(MESSAGEEDITOR.COMMAND.RANDOMIZER.CANCEL, () => this.close());

		// Лишнее из готового спинтакса отсекаем сразу: набрать столько всё равно бы не дали.
		// Каждый вариант проходит ту же чистку, что и вставка: исходный текст приходит выделением
		// из сообщения, и скобки с переносами в нём — не редкость (см. cleanVariant).
		parseSpintax(text)
			.map(cleanVariant)
			.slice(0, MESSAGEEDITOR.VALUE.MAX_VARIANTS)
			.forEach((variant) => this.__addRow(variant));

		this.__refresh();
	}

	/** Непустые варианты в порядке строк — то, из чего собирается спинтакс. */
	private __variants(): string[] {
		return this.__rows()
			.map((row) => textOf(row).trim())
			.filter(Boolean);
	}

	private __rows(): HTMLElement[] {
		return Array.from(this.__list.querySelectorAll<HTMLElement>(".variant"));
	}

	private __addRow(text: string): HTMLElement {
		const row = DOM.tag("div", { class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.VARIANT }, [
			// Не поле ввода, а редактируемая область: вариант бывает длинным, а поле ввода
			// не переносит строку — конец текста уезжал бы за край.
			//
			// the variant comes from the message (a selection or an existing spintax) — as text,
			// never as markup (see textTag)
			textTag(
				"div",
				{
					class: "editable",
					contenteditable: "true",
					dataset: { placeholder: MESSAGEEDITOR.TEXT.VARIANT_PLACEHOLDER },
				},
				text
			),
			DOM.tag(
				"button",
				{
					type: "button",
					class: MESSAGEEDITOR.CLASS.MODAL.ELEMENT.REMOVE,
					title: MESSAGEEDITOR.TEXT.VARIANT_REMOVE,
					command: MESSAGEEDITOR.COMMAND.RANDOMIZER.REMOVE,
				},
				trashIcon
			),
		]);

		this.__list.appendChild(row);

		return row;
	}

	/**
	 * Приводит список к правилу «в конце пустой вариант, пока есть место».
	 *
	 * Хвостовой пустой — это приглашение набрать следующий, а не запись: убирать его нечего,
	 * поэтому у него нет и кнопки удаления (её прячет класс). На пределе приглашения нет вовсе,
	 * а вместо него показывается пояснение, почему список больше не растёт.
	 */
	private __refresh() {
		// один проход по строкам: их тексты нужны и приглашению, и пометке пустых, и кнопке
		const rows = this.__rows();
		const texts = rows.map((row) => textOf(row).trim());

		if (rows.length < MESSAGEEDITOR.VALUE.MAX_VARIANTS && (!rows.length || texts[texts.length - 1])) {
			rows.push(this.__addRow(""));
			texts.push("");
		}

		const last = rows.length - 1;
		rows.forEach((row, index) => row.classList.toggle("blank", index === last && !texts[index]));

		this.element?.classList.toggle("max-variants", rows.length >= MESSAGEEDITOR.VALUE.MAX_VARIANTS);

		// сохранять нечего, пока не набран ни один вариант: иначе нажатие просто ничего не делало бы
		this.__applyButton.disabled = !texts.some(Boolean);
	}

	/**
	 * Правка варианта. Скобки и разделитель развалили бы конструкцию, поэтому не вводятся вовсе.
	 * Enter не переносит строку — вариант это одна строка — а переводит в следующую.
	 *
	 * Имя с приставкой Field: у базового окна есть поле `__onKeyDown` (обработчик Esc), и метод
	 * с тем же именем оно молча перекрывает — вызывался бы чужой обработчик.
	 */
	private __onFieldKeyDown(e: KeyboardEvent) {
		const field = fieldOf(e.target);
		if (!field) return;

		if (FORBIDDEN_KEYS.includes(e.key)) {
			e.preventDefault();
			return;
		}

		if (e.key !== "Enter") return;

		e.preventDefault();

		// пустой вариант снизу уже появился на вводе — остаётся перейти в него
		const next = field.closest(".variant")?.nextElementSibling?.querySelector<HTMLElement>(".editable");
		next?.focus();
	}

	/** Опустевший вариант убираем сам; хвостовой пустой остаётся — в него набирают следующий. */
	private __onFieldBlur(e: FocusEvent) {
		const field = fieldOf(e.target);
		if (!field) return;

		// пробелы по краям в спинтакс не уйдут, поэтому и в поле их держать незачем
		const text = field.textContent?.trim() ?? "";
		if (field.textContent !== text) field.textContent = text;

		const row = field.closest(".variant");
		if (row && !text && row !== this.__list.lastElementChild) row.remove();

		this.__refresh();
	}

	/** Вставка всегда простым текстом в одну строку: разметка и переносы варианту не нужны. */
	private __onFieldPaste(e: ClipboardEvent) {
		if (!fieldOf(e.target)) return;

		e.preventDefault();

		const text = cleanVariant(e.clipboardData?.getData("text/plain") ?? "");
		if (!text) return;

		const doc = this.element?.ownerDocument;
		const selection = doc?.defaultView?.getSelection();
		if (!doc || !selection?.rangeCount) return;

		const range = selection.getRangeAt(0);
		range.deleteContents();

		const node = doc.createTextNode(text);
		range.insertNode(node);
		range.setStartAfter(node);
		range.collapse(true);

		selection.removeAllRanges();
		selection.addRange(range);

		this.__refresh();
	}
}

/** Редактируемое поле, в котором произошло событие, или null. */
function fieldOf(target: EventTarget | null): HTMLElement | null {
	return (target as HTMLElement | null)?.closest?.<HTMLElement>(".editable") ?? null;
}

function textOf(row: HTMLElement): string {
	return row.querySelector(".editable")?.textContent ?? "";
}

/** Собирает спинтакс из вариантов; один вариант рандомизировать нечего. */
export function buildSpintax(variants: string[]): string {
	return variants.length > 1
		? `${MESSAGEEDITOR.SYNTAX.SPINTAX_OPEN}${variants.join(MESSAGEEDITOR.SYNTAX.SPINTAX_SEPARATOR)}${MESSAGEEDITOR.SYNTAX.SPINTAX_CLOSE}`
		: variants[0];
}

/** Разбирает выделение: готовый спинтакс — на варианты, обычный текст — в единственный вариант. */
export function parseSpintax(text: string): string[] {
	const trimmed = text.trim();
	if (trimmed.startsWith(MESSAGEEDITOR.SYNTAX.SPINTAX_OPEN) && trimmed.endsWith(MESSAGEEDITOR.SYNTAX.SPINTAX_CLOSE)) {
		const inner = trimmed.slice(
			MESSAGEEDITOR.SYNTAX.SPINTAX_OPEN.length,
			-MESSAGEEDITOR.SYNTAX.SPINTAX_CLOSE.length
		);
		if (inner.includes(MESSAGEEDITOR.SYNTAX.SPINTAX_SEPARATOR))
			return inner.split(MESSAGEEDITOR.SYNTAX.SPINTAX_SEPARATOR);
	}

	return trimmed ? [trimmed] : [];
}
