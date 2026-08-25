/**
 * @jest-environment jsdom
 */
import Modal from "../source/modal";
import { UIKIT } from "../source/names";
import { UIKIT as PACKAGE_NAMES } from "../source/index";

class TestModal extends Modal {
	override get typeName(): string {
		return "Test.Modal";
	}
}

const opened: Modal[] = [];
const open = (modal: Modal): Modal => {
	opened.push(modal);
	return modal;
};

beforeEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
});

// an unclosed window stays subscribed to its element leaving the DOM, and the jsdom teardown
// triggers that after the environment is already gone
afterEach(() => {
	opened.forEach((modal) => modal.close());
	opened.length = 0;
});

describe("Modal", () => {
	// The title is host data. A string child of DOM.tag is inserted as HTML (that is how the svg
	// reaches the close button), so the title has to reach the DOM as text — otherwise markup
	// coming from data would execute.
	it("renders the title as text, not as markup", () => {
		const title = '<img src=x onerror="window.__pwned = 1">';
		const modal = open(new TestModal({ title }));
		const elem = modal.element!.querySelector<HTMLElement>(".modal-title")!;

		expect(elem.querySelector("img")).toBeNull();
		expect(elem.textContent).toBe(title);
	});

	it("renders no title when none is given", () => {
		const modal = open(new TestModal());

		expect(modal.element!.querySelector(".modal-title")).toBeNull();
	});

	it("renders the close button by default", () => {
		const modal = open(new TestModal());

		expect(modal.element!.querySelector(".modal-close")).not.toBeNull();
	});

	// the button is dropped from the markup, not hidden by styles: a hidden one is still
	// reachable by keyboard
	it("renders no close button when it is turned off", () => {
		const modal = open(new TestModal({ title: "Заголовок", closeButton: false }));

		expect(modal.element!.querySelector(".modal-close")).toBeNull();
		expect(modal.element!.querySelector(".modal-header")).not.toBeNull();
	});

	// an empty header would still take its padding above the body
	it("renders no header without a title and a close button", () => {
		const modal = open(new TestModal({ closeButton: false }));

		expect(modal.element!.querySelector(".modal-header")).toBeNull();
	});

	// хук наследника и подписка на закрытие — разные вещи: onClosing зовут по ещё живому окну,
	// onClosed — когда его уже не стало
	it("calls onClosing before the window is gone, and onClosed after", () => {
		const order: string[] = [];

		class HookedModal extends Modal {
			override get typeName(): string {
				return "Test.HookedModal";
			}

			protected override onClosing(): void {
				order.push(inDocument() ? "closing: окно ещё здесь" : "closing: окна уже нет");
			}
		}

		const inDocument = () => !!document.querySelector(".ui-modal");
		const modal = open(new HookedModal({ title: "Окно" }));
		modal.onClosed(() => order.push(inDocument() ? "closed: окно ещё здесь" : "closed: окна уже нет"));

		modal.close();

		expect(order).toEqual(["closing: окно ещё здесь", "closed: окна уже нет"]);
	});

	// Esc and the backdrop have their own settings — dropping the button leaves them alone
	it("still closes by Esc without the close button", () => {
		const modal = open(new TestModal({ closeButton: false }));

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		expect(document.querySelector(".ui-modal")).toBeNull();
		expect(modal.element).toBeUndefined();
	});
});

describe("UIKIT names", () => {
	// Те же строки прописаны селекторами в modal.less, popup.less и common.less: переименование
	// значения молча разъехалось бы со стилями.
	it("matches the CSS contract", () => {
		expect(UIKIT.MODAL.CLASS.ROOT).toBe("ui-modal");
		expect(UIKIT.MODAL.CLASS.BODY).toBe("body-modal-opened");
		expect(UIKIT.MODAL.CLASS.ELEMENT).toEqual({
			BACKDROP: "modal-backdrop",
			WINDOW: "modal-window",
			HEADER: "modal-header",
			TITLE: "modal-title",
			BODY: "modal-body",
			CLOSE: "modal-close",
		});
		expect(UIKIT.MODAL.COMMAND.CLOSE).toBe("ui-modal-close");
		expect(UIKIT.SCROLLABLE.CLASS).toBe("ui-scrollable");
		expect(UIKIT.BUTTON.CLASS.ROOT).toBe("ui-button");
		expect(UIKIT.BUTTON.CLASS.MODIFIER).toEqual({
			PRIMARY: "primary",
			GHOST: "ghost",
			DANGER: "danger",
			MINI: "mini",
			WIDE: "wide",
		});
		expect(UIKIT.BUTTON.CLASS.STATE).toEqual({ DISABLED: "disabled", LOADING: "loading" });
	});

	// Вид, тон и размер кнопки складываются на одном элементе, и в стилях каждый пишется при
	// `.ui-button` — короткое имя само по себе не значит ничего и чужое не заденет.
	it("keeps the button modifiers short", () => {
		const modifiers = [...Object.values(UIKIT.BUTTON.CLASS.MODIFIER), ...Object.values(UIKIT.BUTTON.CLASS.STATE)];

		modifiers.forEach((name) => expect(name.startsWith("ui-")).toBe(false));
	});

	// имена берут из пакета соседние контролы — вход обязан их отдавать
	it("reaches the consumer through the package entry", () => {
		expect(PACKAGE_NAMES).toBe(UIKIT);
	});
});
