/**
 * @jest-environment jsdom
 */
import { LayerManager } from "../source/layer";
import Modal from "../source/modal";
import { UIKIT } from "../source/names";
import { PopupManager } from "../source/popup";

class TestModal extends Modal {
	override get typeName(): string {
		return "Test.Modal";
	}

	/** Наполнение окна — работа наследника; здесь она нужна ловушке фокуса. */
	fill(...items: HTMLElement[]) {
		this.body.append(...items);

		return this;
	}
}

const opened: Modal[] = [];
const open = (modal: Modal): TestModal => {
	opened.push(modal);

	return modal as TestModal;
};

const makePopup = (host: HTMLElement = document.body): HTMLElement => {
	const el = document.createElement("div");
	el.classList.add(UIKIT.POPUP.CLASS.ROOT);
	host.appendChild(el);

	return el;
};

const makeButton = (name: string, host: HTMLElement = document.body): HTMLButtonElement => {
	const el = document.createElement("button");
	el.textContent = name;
	host.appendChild(el);

	return el;
};

const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const tab = (shiftKey = false) =>
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, shiftKey }));

beforeEach(() => {
	PopupManager.close();
	LayerManager.closeAll();
	document.body.innerHTML = "";
	document.body.className = "";
});

afterEach(() => {
	opened.forEach((modal) => modal.close());
	opened.length = 0;
	LayerManager.closeAll();
});

describe("LayerManager", () => {
	it("closes the topmost layer on Escape and leaves the one below it", () => {
		const lower = jest.fn();
		const upper = jest.fn();

		const lowerLayer = LayerManager.push({ close: lower });
		LayerManager.push({ close: upper });

		escape();

		expect(upper).toHaveBeenCalledTimes(1);
		expect(lower).not.toHaveBeenCalled();
		expect(lowerLayer.isOpened).toBe(true);
		expect(lowerLayer.isTop).toBe(true); // следующий Escape достанется ему
	});

	// слой, который сам не снялся, оставил бы стек с мёртвой вершиной, и следующий Escape ушёл бы в никуда
	it("releases a layer whose close() forgot to", () => {
		LayerManager.push({ close: () => {} });

		escape();

		expect(LayerManager.count).toBe(0);
	});

	it("keeps the key for the layer that handled it itself", () => {
		const close = jest.fn();
		const elem = document.createElement("div");
		document.body.appendChild(elem);
		// строка ввода ссылки, поиск в списке: их Escape про своё, а не про закрытие слоя
		elem.addEventListener("keydown", (e) => e.preventDefault());

		LayerManager.push({ close, element: elem });
		elem.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

		expect(close).not.toHaveBeenCalled();
	});

	it("does not close a layer that opted out of Escape", () => {
		const close = jest.fn();
		LayerManager.push({ close, closeOnEscape: false });

		escape();

		expect(close).not.toHaveBeenCalled();
	});

	it("keeps the body class until the last layer that asked for it is gone", () => {
		const first = LayerManager.push({ close: () => {}, bodyClass: "held" });
		const second = LayerManager.push({ close: () => {}, bodyClass: "held" });

		second.release();
		expect(document.body.classList.contains("held")).toBe(true);

		first.release();
		expect(document.body.classList.contains("held")).toBe(false);
	});

	it("closeAll() closes every layer top-down", () => {
		const order: string[] = [];
		const layerA = LayerManager.push({ close: () => order.push("a") });
		const layerB = LayerManager.push({ close: () => order.push("b") });

		LayerManager.closeAll();

		expect(order).toEqual(["b", "a"]);
		expect(LayerManager.count).toBe(0);
		expect(layerA.isOpened).toBe(false);
		expect(layerB.isOpened).toBe(false);
	});

	it("release() is idempotent", () => {
		const layer = LayerManager.push({ close: () => {}, bodyClass: "held" });

		layer.release();
		layer.release();

		expect(LayerManager.count).toBe(0);
		expect(document.body.classList.contains("held")).toBe(false);
	});

	// слой снимают и не с вершины: список внутри окна закрывается своим нажатием мимо себя
	it("releases a layer from the middle of the stack", () => {
		const lower = LayerManager.push({ close: () => {} });
		const middle = LayerManager.push({ close: () => {} });
		const upper = LayerManager.push({ close: () => {} });

		middle.release();

		expect(LayerManager.count).toBe(2);
		expect(upper.isTop).toBe(true);
		expect(lower.isOpened).toBe(true);
	});

	it("returns focus to where it was taken from", () => {
		const opener = makeButton("Открыть");
		const elem = document.createElement("div");
		document.body.appendChild(elem);
		const inside = makeButton("Внутри", elem);

		opener.focus();
		const layer = LayerManager.push({ close: () => {}, element: elem });
		inside.focus();
		layer.release();

		expect(document.activeElement).toBe(opener);
	});

	// фокус ушёл мимо слоя — это выбор пользователя, забирать его назад нельзя
	it("keeps focus that moved outside the layer", () => {
		const opener = makeButton("Открыть");
		const other = makeButton("Другое поле");
		const elem = document.createElement("div");
		document.body.appendChild(elem);

		opener.focus();
		const layer = LayerManager.push({ close: () => {}, element: elem });
		other.focus();
		layer.release();

		expect(document.activeElement).toBe(other);
	});

	it("does not return focus when the layer asked not to", () => {
		const opener = makeButton("Открыть");
		const elem = document.createElement("div");
		document.body.appendChild(elem);
		const inside = makeButton("Внутри", elem);

		opener.focus();
		const layer = LayerManager.push({ close: () => {}, element: elem, returnFocus: false });
		inside.focus();
		layer.release();

		expect(document.activeElement).not.toBe(opener);
	});

	// Корень верхнего слоя обычно лежит ВНУТРИ корня нижнего (попап в окне, список в попапе),
	// поэтому проверки «наш ли фокус» тут не хватает: contains считает своим и чужой.
	it("leaves focus alone when a layer above is holding it", () => {
		const opener = makeButton("Открыть");
		const lowerElem = document.createElement("div");
		document.body.appendChild(lowerElem);

		opener.focus();
		const lower = LayerManager.push({ close: () => {}, element: lowerElem });

		// верхний слой — внутри нижнего, как попап внутри модального окна
		const upperElem = document.createElement("div");
		lowerElem.appendChild(upperElem);
		const inside = makeButton("В верхнем", upperElem);
		const upper = LayerManager.push({ close: () => {}, element: upperElem });
		inside.focus();

		// нижний снимают не по порядку — верхний ещё открыт, и каретка сейчас его
		lower.release();

		expect(document.activeElement).toBe(inside);

		// своё нижний получит обратно, когда снимется верхний: фокус проходит цепочку сверху вниз
		upper.release();

		expect(document.activeElement).toBe(opener);
	});

	// Слой выше бывает и без каретки: попап, раскрытый в окне, пока правят поле самого окна.
	// Отменить возврат «потому что сверху кто-то есть» тут нельзя — сделать его потом некому:
	// попап вернул бы фокус в уже удалённое окно, а список dropdown не возвращает его вовсе.
	it("returns focus when the layer above is not holding it", () => {
		const opener = makeButton("Открыть");
		const lowerElem = document.createElement("div");
		document.body.appendChild(lowerElem);
		const field = makeButton("Поле нижнего", lowerElem);

		opener.focus();
		const lower = LayerManager.push({ close: () => {}, element: lowerElem });

		// попап внутри нижнего слоя, но каретка осталась в самом нижнем
		const upperElem = document.createElement("div");
		lowerElem.appendChild(upperElem);
		const upper = LayerManager.push({ close: () => {}, element: upperElem, returnFocus: false });
		field.focus();

		lower.release();

		expect(document.activeElement).toBe(opener);

		upper.release();
	});
});

// Попап живёт на разметке внутри окна (панель смайликов в поле сообщения), и закрыть окно могут
// из кода, пока попап ещё в стеке: правку значения, перерисовку контейнера.
describe("modal closed under an open popup", () => {
	it("still returns focus to whatever opened the window", () => {
		const opener = makeButton("Открыть окно");
		opener.focus();

		const field = document.createElement("input");
		const modal = open(new TestModal({ closeButton: false })).fill(field);
		const body = modal.element!.querySelector<HTMLElement>(`.${UIKIT.MODAL.CLASS.ELEMENT.BODY}`)!;

		const popupElem = makePopup(body);
		PopupManager.open(popupElem, { initiator: makeButton("Показать", body) });

		// каретка в поле ОКНА, а не в попапе
		field.focus();
		expect(LayerManager.count).toBe(2);

		modal.close();

		expect(document.activeElement).toBe(opener);
	});
});

describe("Modal focus", () => {
	it("takes focus into the window once the heir has filled it", async () => {
		const field = document.createElement("input");
		const modal = open(new TestModal({ title: "Окно", closeButton: false })).fill(field);

		await Promise.resolve(); // фокус заводится микрозадачей — до неё тело окна ещё пустое

		expect(document.activeElement).toBe(field);
		expect(modal.element!.contains(document.activeElement)).toBe(true);
	});

	it("leaves the focus the window set for itself", async () => {
		const first = document.createElement("input");
		const second = document.createElement("input");
		open(new TestModal({ title: "Окно", closeButton: false })).fill(first, second);
		second.focus();

		await Promise.resolve();

		expect(document.activeElement).toBe(second);
	});

	it("gives the window itself the focus when there is nothing to focus inside", async () => {
		const modal = open(new TestModal({ closeButton: false }));

		await Promise.resolve();

		expect(document.activeElement).toBe(modal.element!.querySelector(".modal-window"));
	});

	it("returns focus to the opener when the window closes", async () => {
		const opener = makeButton("Открыть");
		opener.focus();

		const modal = open(new TestModal({ title: "Окно" }));
		await Promise.resolve();
		modal.close();

		expect(document.activeElement).toBe(opener);
	});

	it("wraps Tab from the last element back to the first", () => {
		const first = document.createElement("input");
		const last = document.createElement("input");
		open(new TestModal({ closeButton: false })).fill(first, last);

		last.focus();
		tab();

		expect(document.activeElement).toBe(first);
	});

	it("wraps Shift+Tab from the first element to the last", () => {
		const first = document.createElement("input");
		const last = document.createElement("input");
		open(new TestModal({ closeButton: false })).fill(first, last);

		first.focus();
		tab(true);

		expect(document.activeElement).toBe(last);
	});

	// страница под окном остаётся в документе, и Tab с неё обязан вернуться в окно
	it("pulls Tab back from the page under the window", () => {
		const outside = makeButton("На странице");
		const inside = document.createElement("input");
		open(new TestModal({ closeButton: false })).fill(inside);

		outside.focus();
		tab();

		expect(document.activeElement).toBe(inside);
	});

	it("names the window by its title for a screen reader", () => {
		const modal = open(new TestModal({ title: "Удалить?" }));
		const window = modal.element!.querySelector(".modal-window")!;
		const titleId = window.getAttribute("aria-labelledby");

		expect(titleId).toBeTruthy();
		expect(modal.element!.querySelector(`#${titleId}`)?.textContent).toBe("Удалить?");
	});

	it("leaves no dangling aria-labelledby without a title", () => {
		const modal = open(new TestModal());

		expect(modal.element!.querySelector(".modal-window")!.hasAttribute("aria-labelledby")).toBe(false);
	});
});

describe("popup over a modal", () => {
	it("Escape closes only the popup", () => {
		const modal = open(new TestModal({ title: "Окно" }));
		const popup = makePopup(modal.element!);

		PopupManager.open(popup);
		escape();

		expect(PopupManager.isOpened()).toBe(false);
		expect(popup.classList.contains(UIKIT.POPUP.CLASS.OPENED)).toBe(false);
		expect(document.querySelector(".ui-modal")).not.toBeNull();
	});

	it("the next Escape closes the window under it", () => {
		const modal = open(new TestModal({ title: "Окно" }));
		const popup = makePopup(modal.element!);

		PopupManager.open(popup);
		escape();
		escape();

		expect(modal.element).toBeUndefined();
	});

	// окно придержало прокрутку страницы, и закрытый попап над ним не должен её отпускать
	it("closing the popup keeps the page held by the window", () => {
		const modal = open(new TestModal({ title: "Окно" }));
		const popup = makePopup(modal.element!);

		PopupManager.open(popup);
		PopupManager.close();

		expect(document.body.classList.contains(UIKIT.MODAL.CLASS.BODY)).toBe(true);
	});
});

describe("nested modals", () => {
	it("closing the inner window keeps the page held by the outer one", () => {
		open(new TestModal({ title: "Первое" }));
		const inner = open(new TestModal({ title: "Второе" }));

		inner.close();

		expect(document.body.classList.contains(UIKIT.MODAL.CLASS.BODY)).toBe(true);
	});

	it("releases the page once the last window is closed", () => {
		const outer = open(new TestModal({ title: "Первое" }));
		const inner = open(new TestModal({ title: "Второе" }));

		inner.close();
		outer.close();

		expect(document.body.classList.contains(UIKIT.MODAL.CLASS.BODY)).toBe(false);
	});

	it("Escape closes only the topmost window", () => {
		const outer = open(new TestModal({ title: "Первое" }));
		const inner = open(new TestModal({ title: "Второе" }));

		escape();

		expect(inner.element).toBeUndefined();
		expect(outer.element).not.toBeUndefined();
	});

	it("Tab stays inside the topmost window", () => {
		const under = document.createElement("input");
		open(new TestModal({ closeButton: false })).fill(under);

		const overFirst = document.createElement("input");
		const overLast = document.createElement("input");
		open(new TestModal({ closeButton: false })).fill(overFirst, overLast);

		overLast.focus();
		tab();

		expect(document.activeElement).toBe(overFirst);
	});
});
