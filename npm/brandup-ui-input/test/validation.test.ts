/**
 * @jest-environment jsdom
 */
import { InputControl, INPUT } from "../source/index";

// Раньше о непройденной проверке говорила одна красная рамка: текст браузера оставался
// в `validationMessage`, и его не читал никто, а `aria` у контрола не было вовсе — читалке
// поле казалось верным. Здесь проверяется всё, что теперь показывается вместо этого.
//
// Умолчание — место хоста: раскладка страницы принадлежит ему, и узлов в ней кит сам
// не заводит. Пузырь у контрола рисуется только по явной просьбе.

class TestInput extends InputControl<HTMLInputElement> {
	constructor(valueElem: HTMLInputElement) {
		const container = document.createElement("div");
		valueElem.insertAdjacentElement("afterend", container);
		container.insertAdjacentElement("afterbegin", valueElem);

		super("Test.Input", container, valueElem);
	}
}

type Control = InputControl<HTMLInputElement>;

const setup = (message = "Ошибка."): { input: HTMLInputElement; control: Control } => {
	const form = document.createElement("form");
	const input = document.createElement("input");
	input.type = "text";
	form.appendChild(input);
	document.body.appendChild(form);
	input.setCustomValidity(message);

	return { input, control: new TestInput(input) };
};

/** Место под сообщение внутри контрола — так его даёт разметка хоста. */
const slotInside = (control: Control): HTMLElement => {
	const slot = document.createElement("div");
	slot.setAttribute(INPUT.ATTR.ERROR, "");
	control.element.appendChild(slot);

	return slot;
};

const bubble = (control: Control) => control.element.querySelector<HTMLElement>(`.${INPUT.CLASS.ERROR}`);

const invalid = (control: Control) => control.element.classList.contains(INPUT.CLASS.STATE.INVALID);

beforeEach(() => {
	document.body.innerHTML = "";
});

// Контрол, доживший в DOM до сноса jsdom, роняет процесс: разбирая документ, тот удаляет узлы,
// авторазрушение срабатывает уже без `document`, и ошибку некому даже показать.
afterEach(() => {
	document.body.innerHTML = "";
});

describe("состояние отказа", () => {
	it("помечает контрол и поле для читалки", () => {
		const { input, control } = setup();

		expect(control.validate()).toBe(false);

		expect(invalid(control)).toBe(true);
		expect(input.getAttribute("aria-invalid")).toBe("true");
	});

	it("убирает пометку, когда значение стало годным", () => {
		const { input, control } = setup();
		control.validate();

		input.setCustomValidity("");
		expect(control.validate()).toBe(true);

		expect(invalid(control)).toBe(false);
		expect(input.hasAttribute("aria-invalid")).toBe(false);
	});

	// Отказ приходит и мимо validate() — браузер поднимает `invalid` на отправке формы.
	it("отмечается и по отказу на отправке", () => {
		const { input, control } = setup();
		const slot = slotInside(control);

		input.dispatchEvent(new Event("invalid", { cancelable: true }));

		expect(invalid(control)).toBe(true);
		expect(slot.textContent).toBe("Ошибка.");
	});
});

describe("сообщение в месте хоста", () => {
	it("пишет текст браузера туда, где хост отвёл место", () => {
		const { control } = setup("Заполните это поле.");
		const slot = slotInside(control);

		control.validate();

		expect(slot.textContent).toBe("Заполните это поле.");
		expect(slot.hidden).toBe(false);
	});

	// Так текст кладут в сводку под формой или в соседнюю колонку таблицы — туда, где элемент
	// контролу не потомок.
	it("находит место по идентификатору, названному на контроле", () => {
		const { control } = setup();

		const outside = document.createElement("p");
		outside.id = "summary-error";
		document.body.appendChild(outside);
		control.element.setAttribute(INPUT.ATTR.ERROR, "summary-error");

		control.validate();

		expect(outside.textContent).toBe("Ошибка.");
	});

	// Связь текста с полем — единственное, что доносит сообщение до читалки: рамка ей не видна,
	// а сам текст без ссылки остаётся отдельным куском страницы.
	it("связывает текст с полем через aria-describedby", () => {
		const { input, control } = setup();
		const slot = slotInside(control);

		control.validate();

		expect(slot.id).toBeTruthy();
		expect(input.getAttribute("aria-describedby")).toBe(slot.id);
	});

	// У поля бывает и подпись, и подсказка: заменять список целиком значит отнять у читалки
	// половину сведений о поле.
	it("дописывает свой идентификатор к чужим, а не заменяет их", () => {
		const { input, control } = setup();
		input.setAttribute("aria-describedby", "hint-1 hint-2");
		const slot = slotInside(control);

		control.validate();
		expect(input.getAttribute("aria-describedby")).toBe(`hint-1 hint-2 ${slot.id}`);

		input.setCustomValidity("");
		control.validate();
		expect(input.getAttribute("aria-describedby")).toBe("hint-1 hint-2");
	});

	// Связь через `aria-describedby` срабатывает, когда в поле входят, а отказ на отправке
	// приходит, когда фокус где угодно: без объявления область осталась бы непрочитанной.
	it("просит читалку зачитать появившийся текст", () => {
		const { control } = setup();
		const slot = slotInside(control);

		control.validate();

		expect(slot.getAttribute("aria-live")).toBe("polite");
	});

	it("не спорит с тем, как хост распорядился сам", () => {
		const { control } = setup();
		const slot = slotInside(control);
		slot.setAttribute("role", "alert");

		control.validate();

		expect(slot.hasAttribute("aria-live")).toBe(false);
	});

	// Внутри контрола может стоять другой контрол со своим местом под сообщение — например,
	// поле поиска внутри списка. Занять чужое значит писать отказ одного поля в текст другого.
	it("не занимает место вложенного контрола", () => {
		const { control } = setup();

		const nested = document.createElement("div");
		nested.className = INPUT.CLASS.ROOT;
		const nestedSlot = document.createElement("div");
		nestedSlot.setAttribute(INPUT.ATTR.ERROR, "");
		nested.appendChild(nestedSlot);
		control.element.appendChild(nested);

		control.validate();

		expect(nestedSlot.textContent).toBe("");
	});

	it("убирает текст и ссылку, когда значение стало годным", () => {
		const { input, control } = setup();
		const slot = slotInside(control);
		control.validate();

		input.setCustomValidity("");
		control.validate();

		expect(slot.textContent).toBe("");
		expect(slot.hidden).toBe(true);
		expect(input.hasAttribute("aria-describedby")).toBe(false);
	});
});

describe("без места хоста", () => {
	// Раскладка страницы принадлежит хосту: не дал места — значит показывает отказ сам,
	// по классу состояния и `aria-invalid`.
	it("по умолчанию не рисует ничего", () => {
		const { control } = setup();

		control.validate();

		expect(invalid(control)).toBe(true);
		expect(bubble(control)).toBeNull();
		expect(control.element.children).toHaveLength(1); // одно только поле-носитель
	});

	it("рисует пузырь, если о нём попросили", () => {
		const { input, control } = setup();
		control.element.setAttribute(INPUT.ATTR.ERROR_DISPLAY, "popup");

		control.validate();

		expect(bubble(control)?.textContent).toBe("Ошибка.");
		expect(bubble(control)?.hidden).toBe(false);
		expect(input.getAttribute("aria-describedby")).toBe(bubble(control)!.id);
	});

	it("прячет пузырь, когда значение стало годным", () => {
		const { input, control } = setup();
		control.element.setAttribute(INPUT.ATTR.ERROR_DISPLAY, "popup");
		control.validate();

		input.setCustomValidity("");
		control.validate();

		expect(bubble(control)?.hidden).toBe(true);
		expect(bubble(control)?.textContent).toBe("");
	});

	// Место хоста важнее просьбы о пузыре: постоянная строка не исчезает при прокрутке,
	// и на форме видно сразу все отказы.
	it("предпочитает место хоста пузырю даже в его режиме", () => {
		const { control } = setup();
		control.element.setAttribute(INPUT.ATTR.ERROR_DISPLAY, "popup");
		const slot = slotInside(control);

		control.validate();

		expect(slot.textContent).toBe("Ошибка.");
		expect(bubble(control)).toBeNull();
	});

	it("в режиме none молчит, даже когда место есть", () => {
		const { input, control } = setup();
		control.element.setAttribute(INPUT.ATTR.ERROR_DISPLAY, "none");
		const slot = slotInside(control);

		control.validate();

		expect(invalid(control)).toBe(true);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(slot.textContent).toBe("");
		expect(input.hasAttribute("aria-describedby")).toBe(false);
	});
});

// Контрол при разрушении возвращает поле-носитель таким, каким взял: класс снимается, подменённые
// атрибуты возвращаются. Признаки состояния ставились мимо этого учёта — и оставались на поле
// после того, как контрола не стало.
describe("разрушение контрола", () => {
	it("не оставляет на поле признаков отказа", () => {
		const { input, control } = setup();
		slotInside(control);
		control.validate();

		expect(input.getAttribute("aria-invalid")).toBe("true");

		control.destroy();

		expect(input.hasAttribute("aria-invalid")).toBe(false);
		expect(input.hasAttribute("aria-describedby")).toBe(false);
	});

	// Ссылка на удалённый вместе с контролом элемент читалке ничего не даёт, а поле остаётся
	// в форме и живёт дальше.
	it("не оставляет ссылки на исчезнувший пузырь", () => {
		const { input, control } = setup();
		control.element.setAttribute(INPUT.ATTR.ERROR_DISPLAY, "popup");
		control.validate();

		control.destroy();

		expect(input.hasAttribute("aria-describedby")).toBe(false);
	});
});
