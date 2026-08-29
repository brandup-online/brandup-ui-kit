/**
 * @jest-environment jsdom
 */
import { PopupManager } from "../source/popup";
import { UIKIT } from "../source/names";

function makePopup(): HTMLElement {
	const el = document.createElement("div");
	el.classList.add(UIKIT.POPUP.CLASS.ROOT);
	document.body.appendChild(el);
	return el;
}

function makeInitiator(): HTMLElement {
	const el = document.createElement("button");
	document.body.appendChild(el);
	return el;
}

describe("PopupManager", () => {
	beforeEach(() => {
		PopupManager.close(); // reset singleton state across tests
		document.body.innerHTML = "";
	});

	it("open() marks popup as opened and updates isOpened()", () => {
		const popup = makePopup();
		expect(PopupManager.isOpened()).toBe(false);

		PopupManager.open(popup);

		expect(popup.classList.contains("ui-popup-opened")).toBe(true);
		expect(PopupManager.isOpened()).toBe(true);
	});

	it("close() removes opened class and resets isOpened()", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		PopupManager.close();

		expect(popup.classList.contains("ui-popup-opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	it("open() with initiator marks the initiator as expanded", () => {
		const popup = makePopup();
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(initiator.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(true);
	});

	it("close() unmarks the initiator", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		PopupManager.close();

		expect(initiator.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(false);
	});

	it("calling close() twice is idempotent", () => {
		const popup = makePopup();
		PopupManager.open(popup);
		PopupManager.close();

		expect(() => PopupManager.close()).not.toThrow();
		expect(PopupManager.isOpened()).toBe(false);
	});

	// open() показывает — и только: закрывать открытое им же было бы сюрпризом для того,
	// кто просто просит показать попап (перерисовка содержимого, показ по внешнему событию)
	it("re-opening the same popup keeps it open", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		PopupManager.open(popup);

		expect(popup.classList.contains("ui-popup-opened")).toBe(true);
		expect(PopupManager.isOpened(popup)).toBe(true);
	});

	it("toggle() opens a closed popup and reports it open", () => {
		const popup = makePopup();

		expect(PopupManager.toggle(popup)).toBe(true);
		expect(PopupManager.isOpened(popup)).toBe(true);
	});

	it("toggle() closes the popup it opened and reports it closed", () => {
		const popup = makePopup();
		PopupManager.toggle(popup);

		expect(PopupManager.toggle(popup)).toBe(false);
		expect(popup.classList.contains("ui-popup-opened")).toBe(false);
		expect(PopupManager.isOpened()).toBe(false);
	});

	// нажали кнопку соседнего попапа: прежний закрывается, новый показывается
	it("toggle() switches from another open popup", () => {
		const first = makePopup();
		const second = makePopup();
		PopupManager.toggle(first);

		expect(PopupManager.toggle(second)).toBe(true);
		expect(PopupManager.isOpened(second)).toBe(true);
		expect(first.classList.contains("ui-popup-opened")).toBe(false);
	});

	it("opening a different popup while one is open closes the previous (regression: multi-popup leak)", () => {
		const popupA = makePopup();
		const initiatorA = makeInitiator();
		const popupB = makePopup();
		const initiatorB = makeInitiator();

		PopupManager.open(popupA, { initiator: initiatorA });
		PopupManager.open(popupB, { initiator: initiatorB });

		expect(popupA.classList.contains("ui-popup-opened")).toBe(false);
		expect(initiatorA.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(false);
		expect(popupB.classList.contains("ui-popup-opened")).toBe(true);
		expect(initiatorB.classList.contains(UIKIT.POPUP.CLASS.EXPANDED)).toBe(true);
		expect(PopupManager.isOpened()).toBe(true);
	});

	it("open() marks body and close() unmarks it", () => {
		const popup = makePopup();

		PopupManager.open(popup);
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(true);

		PopupManager.close();
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(false);
	});

	it("body stays marked when another popup takes over", () => {
		const popupA = makePopup();
		const popupB = makePopup();

		PopupManager.open(popupA);
		PopupManager.open(popupB);

		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(true);
	});

	it("toggling the same popup closed unmarks body", () => {
		const popup = makePopup();

		PopupManager.toggle(popup);
		PopupManager.toggle(popup);

		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(false);
	});

	// Те же строки прописаны селекторами в popup.less: переименование константы молча разъехалось
	// бы со стилями, и попап остался бы без оформления открытого состояния.
	it("class names match the CSS contract", () => {
		expect(UIKIT.POPUP.CLASS).toEqual({
			ROOT: "ui-popup",
			OPENED: "ui-popup-opened",
			EXPANDED: "ui-popup-expanded",
			BODY: "body-popup-opened",
		});
		expect(UIKIT.POPUP.COMMAND.TOGGLE).toBe("ui-popup-toggle");
	});

	it("isOpened(elem) answers about that popup only", () => {
		const popup = makePopup();
		const other = makePopup();

		PopupManager.open(popup);

		expect(PopupManager.isOpened(popup)).toBe(true);
		expect(PopupManager.isOpened(other)).toBe(false);
	});

	// кнопка-переключатель объявляет своё состояние: класс виден стилям, aria — скринридеру
	it("open() marks the initiator with aria state bound to the popup", () => {
		const popup = makePopup();
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(initiator.getAttribute("aria-expanded")).toBe("true");
		expect(initiator.getAttribute("aria-controls")).toBe(popup.id);
		expect(popup.id).toBeTruthy();
	});

	it("keeps the id the markup gave the popup", () => {
		const popup = makePopup();
		popup.id = "menu";
		const initiator = makeInitiator();

		PopupManager.open(popup, { initiator });

		expect(popup.id).toBe("menu");
		expect(initiator.getAttribute("aria-controls")).toBe("menu");
	});

	// кнопка остаётся переключателем и в закрытом виде — состояние обязано читаться и тогда
	it("close() leaves the initiator collapsed, not silent", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		PopupManager.close();

		expect(initiator.getAttribute("aria-expanded")).toBe("false");
	});

	// фокус ушёл в попап с клавиатуры — по закрытию его возвращают на кнопку, иначе он теряется на body
	it("returns focus to the initiator when the popup had it", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		const inside = document.createElement("button");
		popup.appendChild(inside);

		PopupManager.open(popup, { initiator });
		inside.focus();
		PopupManager.close();

		expect(document.activeElement).toBe(initiator);
	});

	// попап смайликов открывают, не отпуская каретку в поле: забирать её у поля нельзя
	it("leaves focus where it stayed outside the popup", () => {
		const field = document.createElement("input");
		document.body.appendChild(field);
		const popup = makePopup();
		const initiator = makeInitiator();

		field.focus();
		PopupManager.open(popup, { initiator });
		PopupManager.close();

		expect(document.activeElement).toBe(field);
	});

	it("Escape closes the popup", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(PopupManager.isOpened()).toBe(false);
		expect(popup.classList.contains(UIKIT.POPUP.CLASS.OPENED)).toBe(false);
	});

	it("other keys keep the popup open", () => {
		const popup = makePopup();
		PopupManager.open(popup);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(PopupManager.isOpened()).toBe(true);
	});

	it("Escape after close does not fire onClose again", () => {
		const popup = makePopup();
		const onClose = jest.fn();
		PopupManager.open(popup, { onClose });
		PopupManager.close();

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("close() fires the onClose callback", () => {
		const popup = makePopup();
		const onClose = jest.fn();

		PopupManager.open(popup, { onClose });
		PopupManager.close();

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("body click outside the popup closes it", () => {
		const popup = makePopup();
		const outside = document.createElement("div");
		document.body.appendChild(outside);

		PopupManager.open(popup);
		outside.click();

		expect(PopupManager.isOpened()).toBe(false);
	});

	it("body click inside the popup keeps it open", () => {
		const popup = makePopup();
		const inside = document.createElement("span");
		popup.appendChild(inside);

		PopupManager.open(popup);
		inside.click();

		expect(PopupManager.isOpened()).toBe(true);
	});

	it("clicking the initiator preventDefaults and closes (no re-open via bubbling)", () => {
		const popup = makePopup();
		const initiator = makeInitiator();
		PopupManager.open(popup, { initiator });

		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		initiator.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(PopupManager.isOpened()).toBe(false);
	});
});

// Вложенные попапы: подменю, раскрытое из меню, панель смайликов внутри раскрытой панели.
// Родство определяется по кнопке — стоящая внутри открытого попапа раскрывает подменю, а не
// заменяет собой родителя. Соседи по-прежнему вытесняют друг друга: два меню в шапке
// одновременно раскрытыми быть не должны (см. проверки выше).
describe("PopupManager: вложенные попапы", () => {
	beforeEach(() => {
		PopupManager.close();
		document.body.innerHTML = "";
	});

	/** Попап и кнопка, раскрывающая его изнутри `parent`. */
	function makeChildOf(parent: HTMLElement): { popup: HTMLElement; initiator: HTMLElement } {
		const initiator = document.createElement("button");
		parent.appendChild(initiator);

		return { popup: makePopup(), initiator };
	}

	it("подменю ложится поверх родителя, а не вместо него", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);

		PopupManager.open(child.popup, { initiator: child.initiator });

		expect(PopupManager.isOpened(parent)).toBe(true);
		expect(PopupManager.isOpened(child.popup)).toBe(true);
		expect(PopupManager.count).toBe(2);
		expect(PopupManager.current).toBe(child.popup);
	});

	it("закрытие родителя уносит и подменю", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.close(parent);

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(false);
		expect(PopupManager.count).toBe(0);
	});

	it("закрытие подменю родителя не трогает", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.close(child.popup);

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	// Слушатель Escape один на весь стек слоёв, и снимает он верхний: иначе одно нажатие
	// закрыло бы вместе с подменю и меню под ним.
	it("Escape снимает только верхний попап", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	it("нажатие внутри родителя закрывает подменю, а родителя оставляет", () => {
		const parent = makePopup();
		const inside = document.createElement("span");
		parent.appendChild(inside);
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		inside.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	// Повторное нажатие по кнопке подменю — его закрытие, и событие гасится: иначе команда
	// `ui-popup-toggle`, всплывающая следом, увидела бы попап закрытым и открыла заново.
	it("повторное нажатие по кнопке подменю закрывает только его", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		child.initiator.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(PopupManager.isOpened(child.popup)).toBe(false);
		expect(PopupManager.isOpened(parent)).toBe(true);
	});

	it("нажатие мимо всех закрывает и подменю, и родителя", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(PopupManager.count).toBe(0);
	});

	// Кнопка на странице, а не внутри попапа: такой попап открытым не родня, и они закрываются.
	it("самостоятельный попап вытесняет весь стек", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		const neighbour = makePopup();
		PopupManager.open(neighbour, { initiator: makeInitiator() });

		expect(PopupManager.count).toBe(1);
		expect(PopupManager.isOpened(neighbour)).toBe(true);
		expect(PopupManager.isOpened(parent)).toBe(false);
	});

	// Класс на body считает менеджер слоёв: снимается он по последнему закрытому, иначе
	// закрытие подменю вернуло бы странице прокрутку, придержанную ещё родителем.
	it("класс на body держится, пока открыт хоть один", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.close(child.popup);
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(true);

		PopupManager.close(parent);
		expect(document.body.classList.contains(UIKIT.POPUP.CLASS.BODY)).toBe(false);
	});

	// Закрываем сверху вниз, поэтому фокус идёт по цепочке: из подменю на его кнопку в родителе,
	// а не сразу на страницу.
	it("фокус возвращается по цепочке", () => {
		const parent = makePopup();
		const parentInitiator = makeInitiator();
		PopupManager.open(parent, { initiator: parentInitiator });
		const child = makeChildOf(parent);
		child.initiator.focus();
		PopupManager.open(child.popup, { initiator: child.initiator });
		child.popup.focus();

		PopupManager.close(child.popup);

		expect(document.activeElement).toBe(child.initiator);
	});

	it("открытый повторно тем же вызовом остаётся на своём месте в стеке", () => {
		const parent = makePopup();
		PopupManager.open(parent);
		const child = makeChildOf(parent);
		PopupManager.open(child.popup, { initiator: child.initiator });

		PopupManager.open(child.popup, { initiator: child.initiator });

		expect(PopupManager.count).toBe(2);
		expect(PopupManager.current).toBe(child.popup);
	});
});

// Позиционирование включается опцией и по умолчанию выключено: попапу оставлены координаты,
// написанные в разметке проекта, — правило вида `left: calc(100% + 10px)` работало до появления
// опции и обязано работать после. Сам расчёт проверяется в position.test.ts, здесь — что
// менеджер его включает, выключает и прибирает за собой.
describe("PopupManager: позиционирование у якоря", () => {
	// jsdom раскладку не считает, и вьюпорт у него нулевой — при таком любой попап прижимается
	// к отступу от края, и проверять было бы нечего. Задаём размеры экрана сами.
	beforeAll(() => {
		Object.defineProperty(document.documentElement, "clientWidth", { value: 1000, configurable: true });
		Object.defineProperty(document.documentElement, "clientHeight", { value: 800, configurable: true });
	});

	beforeEach(() => {
		PopupManager.close();
		document.body.innerHTML = "";
	});

	it("без опции координаты попапа не трогает", () => {
		const popup = makePopup();
		popup.style.left = "42px";

		PopupManager.open(popup, { initiator: makeInitiator() });

		expect(popup.style.position).toBe("");
		expect(popup.style.left).toBe("42px");
	});

	it("с опцией ставит попап у инициатора", () => {
		const popup = makePopup();

		PopupManager.open(popup, { initiator: makeInitiator(), position: true });

		expect(popup.style.position).toBe("fixed");
		expect(popup.style.left).not.toBe("");
	});

	it("закрытие возвращает попапу его собственные координаты", () => {
		const popup = makePopup();
		PopupManager.open(popup, { initiator: makeInitiator(), position: true });

		PopupManager.close(popup);

		expect(popup.style.position).toBe("");
		expect(popup.style.left).toBe("");
		expect(popup.style.top).toBe("");
	});

	// Попап у поля ввода раскрывают кнопкой внутри поля, а вставать он должен по всему полю.
	it("якорь можно задать отдельно от кнопки", () => {
		const popup = makePopup();
		const field = document.createElement("div");
		document.body.appendChild(field);
		field.getBoundingClientRect = () => ({ left: 120, top: 40, width: 300, height: 46 }) as DOMRect;

		PopupManager.open(popup, { initiator: makeInitiator(), position: { anchor: field } });

		expect(popup.style.left).toBe("120px");
		expect(popup.style.top).toBe("90px"); // 40 + 46 + зазор 4
	});

	// Опция без якоря — ни инициатора, ни `anchor` — не должна ронять открытие: попап
	// просто останется на своих координатах.
	it("без якоря просто не позиционирует", () => {
		const popup = makePopup();

		PopupManager.open(popup, { position: true });

		expect(PopupManager.isOpened(popup)).toBe(true);
		expect(popup.style.position).toBe("");
	});
});
