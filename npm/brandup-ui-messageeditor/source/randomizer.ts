import { DOM } from "@brandup/ui";
import { Modal } from "@brandup/ui-kit";

export const SPINTAX_OPEN = "[";
export const SPINTAX_CLOSE = "]";
export const SPINTAX_SEPARATOR = "|";

const ADD_COMMAND = "randomizer-add";
const REMOVE_COMMAND = "randomizer-remove";
const APPLY_COMMAND = "randomizer-apply";

/**
 * Конструктор рандомизации: список вариантов, из которых собирается спинтакс `[раз|два]`.
 * Варианты вводятся вручную — подбор синонимов остаётся на стороне приложения.
 */
export default class RandomizerModal extends Modal {
	private readonly __variants: string[];
	private readonly __apply: (spintax: string) => void;
	private readonly __list: HTMLElement;

	override get typeName(): string {
		return "BrandUp.MessageEditor.Randomizer";
	}

	/**
	 * @param text Выделенный текст: становится первым вариантом. Если это уже спинтакс — разбирается на варианты.
	 * @param apply Вызывается с готовым спинтаксом; при отмене не вызывается.
	 */
	constructor(text: string, apply: (spintax: string) => void) {
		super({ title: "Рандомизация текста", className: "messageeditor-randomizer" });

		this.__variants = parseSpintax(text);
		this.__apply = apply;
		this.__list = DOM.tag("div", { class: "variants" });

		this.body.appendChild(this.__list);
		this.body.appendChild(
			DOM.tag("div", { class: "actions" }, [
				DOM.tag("button", { type: "button", class: "add", "data-command": ADD_COMMAND }, "Добавить вариант"),
				DOM.tag("button", { type: "button", class: "apply", "data-command": APPLY_COMMAND }, "Вставить"),
			])
		);

		this.registerCommand(ADD_COMMAND, () => {
			this.__collect();
			this.__variants.push("");
			this.__renderVariants();
			this.__list.querySelector<HTMLInputElement>("input:last-of-type")?.focus();
		});

		this.registerCommand(REMOVE_COMMAND, (context) => {
			this.__collect();
			const index = Number(context.target.getAttribute("data-index"));
			this.__variants.splice(index, 1);
			this.__renderVariants();
		});

		this.registerCommand(APPLY_COMMAND, () => {
			this.__collect();

			// пустые варианты не несут смысла: `[раз||два]` даёт пустую подстановку
			const variants = this.__variants.map((v) => v.trim()).filter(Boolean);
			if (!variants.length) return;

			this.__apply(buildSpintax(variants));
			this.close();
		});

		this.__renderVariants();
	}

	// Значения живут в полях ввода, а перерисовка списка их пересоздаёт — снимаем перед каждой.
	private __collect() {
		this.__list.querySelectorAll<HTMLInputElement>("input").forEach((input, index) => {
			this.__variants[index] = input.value;
		});
	}

	private __renderVariants() {
		DOM.empty(this.__list);

		if (!this.__variants.length) this.__variants.push("");

		this.__variants.forEach((variant, index) => {
			this.__list.appendChild(
				DOM.tag("div", { class: "variant" }, [
					DOM.tag("input", { type: "text", value: variant, placeholder: "Вариант текста" }),
					// последний вариант удалять нечего — иначе список опустеет
					this.__variants.length > 1
						? DOM.tag(
								"button",
								{
									type: "button",
									class: "remove",
									title: "Убрать вариант",
									"data-command": REMOVE_COMMAND,
									"data-index": String(index),
								},
								"×"
							)
						: null,
				])
			);
		});
	}
}

/** Собирает спинтакс из вариантов; один вариант рандомизировать нечего. */
export function buildSpintax(variants: string[]): string {
	return variants.length > 1 ? `${SPINTAX_OPEN}${variants.join(SPINTAX_SEPARATOR)}${SPINTAX_CLOSE}` : variants[0];
}

/** Разбирает выделение: готовый спинтакс — на варианты, обычный текст — в единственный вариант. */
export function parseSpintax(text: string): string[] {
	const trimmed = text.trim();
	if (trimmed.startsWith(SPINTAX_OPEN) && trimmed.endsWith(SPINTAX_CLOSE)) {
		const inner = trimmed.slice(SPINTAX_OPEN.length, -SPINTAX_CLOSE.length);
		if (inner.includes(SPINTAX_SEPARATOR)) return inner.split(SPINTAX_SEPARATOR);
	}

	return trimmed ? [trimmed] : [];
}
