/**
 * @jest-environment jsdom
 */
import DropDown from "../source/dropdown";
import { DROPDOWN } from "../source/names";
import { DROPDOWN as PACKAGE_NAMES } from "../source/index";
import { UIKIT } from "@brandup/ui-kit";
import { UIKIT as KIT_NAMES_SUBPATH } from "@brandup/ui-kit/names";

// jsdom не реализует Element.scrollTo, а открытие списка прокручивает его к выбранному пункту:
// без заглушки обработчик падал бы на полпути и не доходил до остальной работы.
beforeAll(() => {
	Element.prototype.scrollTo = Element.prototype.scrollTo ?? function () {};
});

function makeSelect(options: Array<[value: string, text: string]>): HTMLSelectElement {
	document.body.innerHTML = "";
	const select = document.createElement("select");
	for (const [value, text] of options) {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = text;
		select.appendChild(opt);
	}
	document.body.appendChild(select);
	return select;
}

// Контролы тестов живут до сборки мусора DOM: пока их элементы не убрали, слушатели на body
// и класс открытого списка достались бы следующему тесту.
afterEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
});

const press = (elem: HTMLElement) => elem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
const release = (elem: HTMLElement) => elem.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

/** Dropdown с открытым списком — состояние, в котором проверяют его закрытие. */
function openedDropDown(): DropDown {
	const dd = new DropDown(
		makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		])
	);

	const view = dd.element!.querySelector(".view") as HTMLElement;
	view.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

	return dd;
}

describe("DropDown", () => {
	it("wraps the select in a ui-dropdown container", () => {
		const select = makeSelect([["1", "One"]]);
		const dd = new DropDown(select);
		expect(dd.element?.classList.contains(DROPDOWN.CLASS.ROOT)).toBe(true);
	});

	it("renders each option as an <li> item", () => {
		const select = makeSelect([
			["1", "One"],
			["2", "Two"],
			["3", "Three"],
		]);
		const dd = new DropDown(select);
		const items = dd.element!.querySelectorAll("ul li");
		expect(items.length).toBe(3);
	});

	it("first empty-value option is treated as a placeholder and not rendered as item", () => {
		const select = makeSelect([
			["", ""],
			["a", "Alpha"],
		]);
		const dd = new DropDown(select);
		const items = dd.element!.querySelectorAll("ul li");
		expect(items.length).toBe(1);
		expect(items[0].textContent).toContain("Alpha");
	});

	it("excludes options whose value is already in the list (deduplicates by value)", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
			["a", "Alpha duplicate"], // тот же value "a" — не должен попасть в список
			["c", "Gamma"],
		]);
		const dd = new DropDown(select);

		const values = [...dd.element!.querySelectorAll("ul li")].map((li) => (li as HTMLElement).dataset.value);
		expect(values).toEqual(["a", "b", "c"]);
		expect(dd.element!.querySelectorAll("ul li").length).toBe(3);
	});

	it("renders option text as text, not HTML (XSS regression)", () => {
		const select = makeSelect([["1", "<img src=x onerror=alert(1)>"]]);
		const dd = new DropDown(select);

		expect(dd.element!.querySelector("li img")).toBeNull();
		const span = dd.element!.querySelector("li span");
		expect(span?.textContent).toBe("<img src=x onerror=alert(1)>");
	});

	it('data-search-on="false" disables searchable (regression: switch fall-through)', () => {
		const opts: Array<[string, string]> = [];
		for (let i = 0; i < 20; i++) opts.push([`${i}`, `Option ${i}`]);
		const select = makeSelect(opts);
		select.setAttribute("data-search-on", "false");

		const dd = new DropDown(select);
		expect(dd.element?.classList.contains("searchable")).toBe(false);
	});

	it('data-search-on="true" enables searchable', () => {
		const select = makeSelect([["1", "One"]]);
		select.setAttribute("data-search-on", "true");
		const dd = new DropDown(select);
		expect(dd.element?.classList.contains("searchable")).toBe(true);
	});

	it('data-search-on="N" enables searchable when option count >= N', () => {
		const opts: Array<[string, string]> = [];
		for (let i = 0; i < 5; i++) opts.push([`${i}`, `Option ${i}`]);
		const select = makeSelect(opts);
		select.setAttribute("data-search-on", "3");

		const dd = new DropDown(select);
		expect(dd.element?.classList.contains("searchable")).toBe(true);
	});

	it("getValue() returns the selected value", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		select.value = "b";
		const dd = new DropDown(select);
		expect(dd.getValue()).toBe("b");
	});

	it("getSelectedTitle() returns the visible text of the selected option", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		select.value = "b";
		const dd = new DropDown(select);
		expect(dd.getSelectedTitle()).toBe("Beta");
	});

	it("getSelectedIndex() returns the selected option's index", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
			["c", "Gamma"],
		]);
		select.value = "c";
		const dd = new DropDown(select);
		expect(dd.getSelectedIndex()).toBe(2);
	});

	it("fires ui:dropdown:change with new value/title when a list item is clicked", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		const dd = new DropDown(select);
		const handler = jest.fn();
		dd.on(DROPDOWN.EVENT.CHANGE, handler);

		const item = dd.element!.querySelector('li[data-index="1"]') as HTMLElement;
		item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				value: "b",
				title: "Beta",
				index: 1,
			})
		);
		expect(dd.getValue()).toBe("b");
	});

	it("Enter in the search input preventDefaults so the enclosing form is not submitted (regression)", () => {
		const opts: Array<[string, string]> = [];
		for (let i = 0; i < 20; i++) opts.push([`${i}`, `Option ${i}`]);
		const form = document.createElement("form");
		document.body.innerHTML = "";
		document.body.appendChild(form);
		const select = document.createElement("select");
		for (const [v, t] of opts) {
			const o = document.createElement("option");
			o.value = v;
			o.textContent = t;
			select.appendChild(o);
		}
		select.setAttribute("data-search-on", "true");
		form.appendChild(select);

		const dd = new DropDown(select);
		const searchInput = dd.element!.querySelector('input[type="search"]') as HTMLInputElement;
		expect(searchInput).not.toBeNull();

		const enterEvent = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
		});
		searchInput.dispatchEvent(enterEvent);

		expect(enterEvent.defaultPrevented).toBe(true);
	});

	it("typing in search filters by prefix; non-matching items keep no .ok class", () => {
		const opts: Array<[string, string]> = [];
		// 20 items, two starting with "Р", rest with other letters — search uses textContent
		const labels = ["Россия", "Казахстан", "Беларусь", "Узбекистан", "Чехия", "Абхазия", "Польша", "Латвия"];
		for (let i = 0; i < 3; i++) for (const t of labels) opts.push([`${i}-${t}`, t]);
		document.body.innerHTML = "";
		const select = document.createElement("select");
		for (const [v, t] of opts) {
			const o = document.createElement("option");
			o.value = v;
			o.textContent = t;
			select.appendChild(o);
		}
		select.setAttribute("data-search-on", "true");
		document.body.appendChild(select);

		const dd = new DropDown(select);
		const searchInput = dd.element!.querySelector('input[type="search"]') as HTMLInputElement;

		searchInput.value = "Р";
		searchInput.dispatchEvent(new Event("input"));

		const okCount = dd.element!.querySelectorAll("ul li.ok").length;
		const totalCount = dd.element!.querySelectorAll("ul li").length;
		// "Россия" appears 3 times, nothing else starts with Р → exactly 3 matches
		expect(okCount).toBe(3);
		// the rest stay unmarked, NOT all items
		expect(okCount).toBeLessThan(totalCount);
	});

	it("changing the search query re-filters: previous matches lose .ok", () => {
		document.body.innerHTML = "";
		const select = document.createElement("select");
		for (const [v, t] of [
			["a", "Apple"],
			["b", "Banana"],
			["c", "Cherry"],
		] as const) {
			const o = document.createElement("option");
			o.value = v;
			o.textContent = t;
			select.appendChild(o);
		}
		select.setAttribute("data-search-on", "true");
		document.body.appendChild(select);

		const dd = new DropDown(select);
		const searchInput = dd.element!.querySelector('input[type="search"]') as HTMLInputElement;

		searchInput.value = "a";
		searchInput.dispatchEvent(new Event("input"));
		expect(
			[...dd.element!.querySelectorAll("ul li.ok")].map((li) => li.querySelector("span")?.textContent)
		).toEqual(["Apple"]);

		searchInput.value = "b";
		searchInput.dispatchEvent(new Event("input"));
		expect(
			[...dd.element!.querySelectorAll("ul li.ok")].map((li) => li.querySelector("span")?.textContent)
		).toEqual(["Banana"]);
	});

	it("clicking the view button opens the popup", () => {
		const select = makeSelect([["a", "Alpha"]]);
		const dd = new DropDown(select);

		const view = dd.element!.querySelector(".view") as HTMLElement;
		view.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(dd.element!.classList.contains("expanded")).toBe(true);
	});

	// в списке работают с ним самим: промах мимо пункта, поиск, полоса прокрутки
	it("keeps the popup open when the press lands inside it", () => {
		const dd = openedDropDown();
		const popup = dd.element!.querySelector(".ui-dropdown-popup") as HTMLElement;
		const list = dd.element!.querySelector("ul") as HTMLElement;

		press(list);
		release(list);
		press(popup);
		release(popup);

		expect(dd.element!.classList.contains("expanded")).toBe(true);
	});

	// перетаскивание полосы прокрутки списка отпускают где угодно — список остаётся открытым
	it("keeps the popup open when a press started inside ends outside", () => {
		const dd = openedDropDown();
		const list = dd.element!.querySelector("ul") as HTMLElement;

		press(list);
		release(document.body);

		expect(dd.element!.classList.contains("expanded")).toBe(true);
	});

	// признак нажатия внутри не должен пережить сам жест, иначе список перестал бы закрываться
	it("forgets the press inside once the gesture is over", () => {
		const dd = openedDropDown();
		const list = dd.element!.querySelector("ul") as HTMLElement;

		press(list);
		release(document.body); // перетащили полосу и отпустили мимо списка
		release(document.body); // отпускание без своего нажатия — свежий жест мимо списка

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	// Нажатие на кнопку показа — работа команды `toggle`, а не правила «нажали мимо списка».
	// Пока кнопка считалась чужой, полный жест по ней закрывал список на mouseup, а идущий следом
	// click открывал его заново: со стороны список не закрывался вовсе.
	it("closes the popup on a second full press on the view", () => {
		const dd = openedDropDown();
		const view = dd.element!.querySelector(".view") as HTMLElement;

		press(view);
		release(view);
		view.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	// Именно mouseup не должен закрывать: закрытие принадлежит команде, и если сделать его здесь,
	// команда получит уже закрытый список и откроет его снова.
	it("leaves the popup to the command when the press lands on the view", () => {
		const dd = openedDropDown();
		const view = dd.element!.querySelector(".view") as HTMLElement;

		press(view);
		release(view);

		expect(dd.element!.classList.contains("expanded")).toBe(true);
	});

	// Сторону выбирают по месту вокруг кнопки, и меряется оно от окна. Раньше здесь стоял
	// `document.body.clientHeight` — высота документа, а не видимой части: на длинной странице она
	// заведомо больше низа списка, поэтому вверх список не уходил никогда.
	describe("which way the list opens", () => {
		/** Окно заданной высоты и кнопка показа в заданном месте — всё, от чего зависит выбор. */
		const layout = (dd: DropDown, options: { viewport: number; anchorTop: number; popupHeight: number }) => {
			const view = dd.element!.querySelector(".view") as HTMLElement;
			const popup = dd.element!.querySelector(".ui-dropdown-popup") as HTMLElement;

			// шире планшетной границы, иначе список показывается листом и место не считается
			Object.defineProperty(document.body, "clientWidth", { value: 1400, configurable: true });
			Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
			Object.defineProperty(document.documentElement, "clientHeight", {
				value: options.viewport,
				configurable: true,
			});

			view.getBoundingClientRect = () =>
				({
					x: 0,
					y: options.anchorTop,
					top: options.anchorTop,
					bottom: options.anchorTop + 40,
					left: 0,
					right: 200,
					width: 200,
					height: 40,
				}) as DOMRect;
			popup.getBoundingClientRect = () =>
				({
					x: 0,
					y: 0,
					top: 0,
					bottom: options.popupHeight,
					left: 0,
					right: 200,
					width: 200,
					height: options.popupHeight,
				}) as DOMRect;

			return popup;
		};

		const opensUp = (options: { viewport: number; anchorTop: number; popupHeight: number }) => {
			const dd = new DropDown(makeSelect([["a", "Alpha"]]));
			const popup = layout(dd, options);

			(dd.element!.querySelector(".view") as HTMLElement).dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true })
			);

			return popup.classList.contains("top");
		};

		it("opens down when the list fits under the button", () => {
			expect(opensUp({ viewport: 800, anchorTop: 100, popupHeight: 300 })).toBe(false);
		});

		// то, ради чего правка: страница длинная, но кнопка у нижнего края окна
		it("opens up when the button sits at the bottom of the window", () => {
			expect(opensUp({ viewport: 800, anchorTop: 700, popupHeight: 300 })).toBe(true);
		});

		it("stays down when it fits nowhere but has more room below", () => {
			expect(opensUp({ viewport: 400, anchorTop: 60, popupHeight: 1000 })).toBe(false);
		});

		// Место меряется по коробке, в которой список видно, а не по окну: обёртка с
		// `overflow: hidden` высотой по содержимому режет всё, что раскрывается ниже последнего
		// элемента страницы, — а окно при этом сообщает, что места вдоволь.
		it("opens up when a clipping wrapper ends just below the button", () => {
			const dd = new DropDown(makeSelect([["a", "Alpha"]]));
			const popup = layout(dd, { viewport: 900, anchorTop: 400, popupHeight: 300 });

			// обёртка кончается сразу под кнопкой, хотя до низа окна ещё 460
			const wrap = document.createElement("div");
			wrap.style.cssText = "overflow-x: hidden; overflow-y: hidden";
			dd.element!.parentElement!.insertBefore(wrap, dd.element!);
			wrap.appendChild(dd.element!);
			wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1400, height: 460 }) as DOMRect;
			Object.defineProperty(wrap, "clientWidth", { value: 1400, configurable: true });
			Object.defineProperty(wrap, "clientHeight", { value: 460, configurable: true });

			(dd.element!.querySelector(".view") as HTMLElement).dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true })
			);

			expect(popup.classList.contains("top")).toBe(true);
		});

		it("goes up when it fits nowhere but has more room above", () => {
			expect(opensUp({ viewport: 400, anchorTop: 300, popupHeight: 1000 })).toBe(true);
		});

		// Граница узкого экрана здесь та же, что у медиазапроса в стилях, и мерить её надо тем же:
		// вьюпортом. У `document.body` ширина своя — из неё вычтено место под полосу прокрутки, —
		// и в этой разнице список считался листом, хотя стили показывали обычный.
		it("measures the narrow-screen threshold by the window, not by the body", () => {
			const dd = new DropDown(makeSelect([["a", "Alpha"]]));
			const popup = layout(dd, { viewport: 800, anchorTop: 700, popupHeight: 300 });

			// окно шире границы, а содержимая ширина body — уже неё
			Object.defineProperty(window, "innerWidth", { value: 1040, configurable: true });
			Object.defineProperty(document.body, "clientWidth", { value: 1010, configurable: true });

			(dd.element!.querySelector(".view") as HTMLElement).dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true })
			);

			expect(popup.classList.contains("top")).toBe(true);
		});
	});

	it("closes the popup on a press outside it", () => {
		const dd = openedDropDown();

		press(document.body);
		release(document.body);

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	it("readonly select (data-readonly) does not open the popup", () => {
		const select = makeSelect([["a", "Alpha"]]);
		select.setAttribute("data-readonly", "");
		const dd = new DropDown(select);

		const view = dd.element!.querySelector(".view") as HTMLElement;
		view.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	it("readonly select does not change value when a list item is clicked", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		select.setAttribute("data-readonly", "");
		const dd = new DropDown(select);
		const handler = jest.fn();
		dd.on(DROPDOWN.EVENT.CHANGE, handler);

		const item = dd.element!.querySelector('li[data-index="1"]') as HTMLElement;
		item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(handler).not.toHaveBeenCalled();
		expect(dd.getValue()).toBe("a");
	});

	it("disabled select does not open the popup", () => {
		const select = makeSelect([["a", "Alpha"]]);
		select.disabled = true;
		const dd = new DropDown(select);

		const view = dd.element!.querySelector(".view") as HTMLElement;
		view.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	it("setValue() selects the value, updates the view text and fires ui:dropdown:change", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		const dd = new DropDown(select);
		const handler = jest.fn();
		dd.on(DROPDOWN.EVENT.CHANGE, handler);

		dd.setValue("b");

		expect(dd.getValue()).toBe("b");
		expect(dd.element!.querySelector(".view span")?.textContent).toBe("Beta");
		expect((dd.element!.querySelector("li.hasvalue") as HTMLElement).dataset.value).toBe("b");
		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ value: "b", title: "Beta", index: 1 }));
	});

	it("setValue() with the already shown value does not fire ui:dropdown:change", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		select.value = "b";
		const dd = new DropDown(select);
		const handler = jest.fn();
		dd.on(DROPDOWN.EVENT.CHANGE, handler);

		dd.setValue("b");

		expect(handler).not.toHaveBeenCalled();
	});

	// сценарий восстановления черновика: значение уже записано в поле-носитель напрямую,
	// setValue должен показать его в контроле, сравнивая с UI, а не с полем
	it("setValue() refreshes the view even when the select value was written directly beforehand", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		const dd = new DropDown(select);

		select.value = "b";
		dd.setValue("b");

		expect(dd.element!.querySelector(".view span")?.textContent).toBe("Beta");
		expect((dd.element!.querySelector("li.hasvalue") as HTMLElement).dataset.value).toBe("b");
	});

	// поле выключили с уже открытым списком: выбор запрещён, но выход из списка обязан работать,
	// иначе на узком экране (список во весь экран) с клавиатуры остаётся только Escape
	it("closing the popup still works when the select gets disabled while it is open", () => {
		const select = makeSelect([["a", "Alpha"]]);
		const dd = new DropDown(select);

		(dd.element!.querySelector(".view") as HTMLElement).dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true })
		);
		expect(dd.element!.classList.contains("expanded")).toBe(true);

		select.disabled = true;
		(dd.element!.querySelector("button.cancel") as HTMLElement).dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true })
		);

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	// значение показанного пункта может совпасть со значением «ничего не выбрано» — сравнивать
	// нужно сам пункт, иначе неизвестное значение оставит на экране прежний выбор
	it("setValue() with an unknown value clears a shown empty-value option", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["", "Не указано"],
		]);
		const dd = new DropDown(select);
		dd.setValue("");
		expect(dd.element!.querySelector(".view span")?.textContent).toBe("Не указано");

		dd.setValue("unknown");

		expect(dd.getValue()).toBeNull();
		expect(dd.element!.querySelector("li.hasvalue")).toBeNull();
		expect(dd.element!.querySelector(".view span")?.textContent).toBe("Select");
	});

	// пустой пункт-подсказка своего <li> не имеет, поэтому «выбран он» и «не выбрано ничего» —
	// одно и то же состояние экрана: повторная установка не должна выглядеть как изменение
	it("setValue() to the empty placeholder option twice fires ui:dropdown:change only once", () => {
		const select = makeSelect([
			["", ""],
			["a", "Alpha"],
		]);
		select.value = "a";
		const dd = new DropDown(select);
		const handler = jest.fn();
		dd.on(DROPDOWN.EVENT.CHANGE, handler);

		dd.setValue("");
		dd.setValue("");
		dd.setValue("");

		expect(handler).toHaveBeenCalledTimes(1);
		expect(dd.getValue()).toBeNull();
	});

	it("setValue() with empty or unknown value clears the selection and shows the placeholder", () => {
		const select = makeSelect([
			["", ""],
			["a", "Alpha"],
		]);
		select.value = "a";
		const dd = new DropDown(select);

		dd.setValue("");

		expect(dd.getValue()).toBeNull();
		expect(dd.element!.querySelector("li.hasvalue")).toBeNull();
		expect(dd.element!.classList.contains("hasvalue")).toBe(false);
		expect(dd.element!.querySelector(".view span")?.textContent).toBe("Select");
	});

	// Пункт с пустым значением не на первом месте — не placeholder, а свой вариант выбора.
	// Выбор пункта нельзя переносить в поле присваиванием value: браузер выберет ПЕРВЫЙ
	// option с таким значением, то есть placeholder, и контрол показал бы не то, что нажали.
	it("selecting a later empty-value option shows that option, not the placeholder", () => {
		const select = makeSelect([
			["", ""],
			["a", "Alpha"],
			["", "Не указано"],
		]);
		const dd = new DropDown(select);

		const item = dd.element!.querySelector('li[data-index="2"]') as HTMLElement;
		expect(item).not.toBeNull();
		item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

		expect(select.selectedIndex).toBe(2);
		expect(dd.element!.querySelector(".view span")?.textContent).toBe("Не указано");
		expect((dd.element!.querySelector("li.hasvalue") as HTMLElement).dataset.index).toBe("2");
	});

	it("destroy() removes the container and restores the original select to the DOM", () => {
		const select = makeSelect([["a", "Alpha"]]);
		const dd = new DropDown(select);
		const container = dd.element!;

		dd.destroy();

		expect(container.isConnected).toBe(false);
		expect(select.isConnected).toBe(true);
	});

	// класс уводит select с экрана (position/opacity/visibility) — без его снятия
	// вернувшийся в DOM элемент остаётся невидимым
	it("destroy() makes the select visible again", () => {
		const select = makeSelect([["a", "Alpha"]]);
		new DropDown(select).destroy();

		expect(select.classList.contains(DROPDOWN.CLASS.INPUT)).toBe(false);
	});
});

describe("DropDown layers", () => {
	const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

	it("Escape closes the popup and returns to the view button", () => {
		const dd = openedDropDown();
		const popup = dd.element!.querySelector(".ui-dropdown-popup") as HTMLElement;
		popup.focus();

		escape();

		expect(dd.element!.classList.contains("expanded")).toBe(false);
		expect(document.activeElement).toBe(dd.element!.querySelector(".view"));
	});

	// список раскрыт во весь экран и придерживает прокрутку — отпускает её только он сам
	it("holds and releases the page by the body class", () => {
		openedDropDown();
		expect(document.body.classList.contains(DROPDOWN.CLASS.BODY)).toBe(true);

		escape();

		expect(document.body.classList.contains(DROPDOWN.CLASS.BODY)).toBe(false);
	});

	// прежний список оставался бы со своими слушателями закрытия и своим слоем в стеке
	it("opening another dropdown closes the previous one completely", () => {
		// свой контрол рядом с прежним: makeSelect чистит body, а здесь нужны оба разом
		const openAnother = (): DropDown => {
			const select = document.createElement("select");
			for (const [value, text] of [
				["a", "Alpha"],
				["b", "Beta"],
			]) {
				const opt = document.createElement("option");
				opt.value = value;
				opt.textContent = text;
				select.appendChild(opt);
			}
			document.body.appendChild(select);

			const dd = new DropDown(select);
			(dd.element!.querySelector(".view") as HTMLElement).dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true })
			);

			return dd;
		};

		const first = openAnother();
		const second = openAnother();

		expect(first.element!.classList.contains("expanded")).toBe(false);
		expect(second.element!.classList.contains("expanded")).toBe(true);

		escape();

		// класс держал один список — и снялся вместе с ним, а не остался от закрытого
		expect(document.body.classList.contains(DROPDOWN.CLASS.BODY)).toBe(false);
	});
});

describe("DropDown names", () => {
	// Те же строки прописаны селекторами в dropdown.less: переименование значения молча разъехалось
	// бы со стилями, и контрол остался бы без оформления.
	it("matches the CSS contract", () => {
		expect(DROPDOWN.CLASS.ROOT).toBe("ui-dropdown");
		expect(DROPDOWN.CLASS.INPUT).toBe("ui-dropdown-input");
		expect(DROPDOWN.CLASS.MINIATURE).toBe("ui-dropdown-miniature");
		expect(DROPDOWN.CLASS.BODY).toBe("body-dropdown-opened");
		expect(DROPDOWN.CLASS.ELEMENT).toEqual({
			POPUP: "ui-dropdown-popup",
			CONTENT: "content",
			HEADER: "header",
			SEARCH: "search",
			VIEW: "view",
			CANCEL: "cancel",
			EMPTY: "empty",
		});
		expect(DROPDOWN.CLASS.STATE).toEqual({
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
		});
	});

	// README учит импортировать имена из пакета — до этого index их не отдавал вовсе
	it("reaches the consumer through the package entry", () => {
		expect(PACKAGE_NAMES).toBe(DROPDOWN);
	});

	// короткий путь к именам соседнего пакета: за строкой класса не тянутся стили и код контрола
	it("takes the kit names by their own subpath", () => {
		expect(KIT_NAMES_SUBPATH).toBe(UIKIT);
	});
});

describe("DropDown accessibility", () => {
	const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

	it("binds the view button to the list it opens", () => {
		const dd = new DropDown(makeSelect([["a", "Alpha"]]));
		const view = dd.element!.querySelector(".view")!;
		// ссылка ведёт на сам список, а не на коробку попапа вокруг него
		const list = dd.element!.querySelector("ul")!;

		expect(list.id).toBeTruthy();
		expect(view.getAttribute("aria-controls")).toBe(list.id);
		expect(view.getAttribute("aria-haspopup")).toBe("listbox");
		expect(view.getAttribute("aria-expanded")).toBe("false");
	});

	// два контрола на странице не должны ссылаться на один и тот же список
	it("gives each control its own list id", () => {
		const first = new DropDown(makeSelect([["a", "Alpha"]]));
		const firstId = first.element!.querySelector("ul")!.id;

		const second = new DropDown(makeSelect([["a", "Alpha"]]));

		expect(second.element!.querySelector("ul")!.id).not.toBe(firstId);
	});

	it("announces the expanded state while the list is open", () => {
		const dd = openedDropDown();
		const view = dd.element!.querySelector(".view")!;
		expect(view.getAttribute("aria-expanded")).toBe("true");

		escape();

		expect(view.getAttribute("aria-expanded")).toBe("false");
	});

	// роль option стоит на том, что принимает фокус, а li между списком и пунктом объявлен пустым
	it("marks up the list as a listbox of options", () => {
		const dd = new DropDown(
			makeSelect([
				["a", "Alpha"],
				["b", "Beta"],
			])
		);

		const list = dd.element!.querySelector("ul")!;
		expect(list.getAttribute("role")).toBe("listbox");
		expect(list.getAttribute("aria-label")).toBe("Select");

		const items = [...list.querySelectorAll("li")];
		expect(items.map((li) => li.getAttribute("role"))).toEqual(["presentation", "presentation"]);
		expect(items.map((li) => li.firstElementChild?.getAttribute("role"))).toEqual(["option", "option"]);
	});

	// кнопка без type внутри формы — submit по умолчанию: Enter в поле формы «нажал» бы её
	// и раскрыл список вместо отправки
	it("renders every button with type=button", () => {
		const dd = new DropDown(makeSelect([["a", "Alpha"]]));

		const buttons = [...dd.element!.querySelectorAll("button")];
		expect(buttons.length).toBeGreaterThan(0);
		expect(buttons.every((button) => button.type === "button")).toBe(true);
	});

	// закрытие в шапке — кнопка одной иконкой: без имени скринридер прочитает её как «кнопка»
	it("names the icon close button by the cancel text", () => {
		const select = makeSelect([["a", "Alpha"]]);
		select.dataset.cancel = "Закрыть список";
		const dd = new DropDown(select);

		const close = dd.element!.querySelector(".ui-dropdown-popup .header button")!;
		expect(close.getAttribute("title")).toBe("Закрыть список");
	});

	// имена команд — часть разметки контрола: разъехавшись с обработчиками, кнопки перестают работать
	it("declares kit-prefixed commands in the markup", () => {
		const dd = new DropDown(makeSelect([["a", "Alpha"]]));
		const root = dd.element!;

		expect((root.querySelector(".view") as HTMLElement).dataset.command).toBe(DROPDOWN.COMMAND.TOGGLE);
		expect((root.querySelector(".cancel") as HTMLElement).dataset.command).toBe(DROPDOWN.COMMAND.CLOSE);
		expect((root.querySelector(".ui-dropdown-popup .header button") as HTMLElement).dataset.command).toBe(
			DROPDOWN.COMMAND.CLOSE
		);
		expect((root.querySelector("li") as HTMLElement).dataset.command).toBe(DROPDOWN.COMMAND.SELECT);
	});

	it("keeps aria-selected on the chosen option only", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		const dd = new DropDown(select);

		dd.setValue("b");

		const selected = [...dd.element!.querySelectorAll("li > span")].map((span) =>
			span.getAttribute("aria-selected")
		);
		expect(selected).toEqual(["false", "true"]);

		dd.setValue("a");

		expect(
			[...dd.element!.querySelectorAll("li > span")].map((span) => span.getAttribute("aria-selected"))
		).toEqual(["true", "false"]);
	});
});

// Поиск прячет непопавшие пункты классом (`.result li { display: none }` в dropdown.less), а
// навигация ходила по порядку разметки — стрелка приводила фокус на скрытый пункт. В браузере
// `focus()` на `display: none` ничего не делает, поэтому клавиша выглядела сломанной: фокус
// оставался на месте, и до следующего совпадения было не добраться.
describe("DropDown keyboard navigation while searching", () => {
	/** Раскрытый список с отфильтрованными пунктами: видимы первый и третий, второй скрыт. */
	function filtered(): { dd: DropDown; items: HTMLElement[] } {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
			["c", "Alps"],
		]);
		select.setAttribute("data-search-on", "true");

		const dd = new DropDown(select);
		const root = dd.element!;
		(root.querySelector(".view") as HTMLElement).dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true })
		);

		const search = root.querySelector('input[type="search"]') as HTMLInputElement;
		search.value = "al";
		search.dispatchEvent(new Event("input", { bubbles: true }));

		const items = [...root.querySelectorAll("li")] as HTMLElement[];
		// сцена держится на этом: Beta между двумя совпадениями и скрыта
		expect(items.map((li) => li.classList.contains("ok"))).toEqual([true, false, true]);

		return { dd, items };
	}

	const arrow = (span: HTMLElement, key: "ArrowDown" | "ArrowUp") =>
		span.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

	const option = (item: HTMLElement) => item.firstElementChild as HTMLElement;

	/**
	 * То же, но скрытый пункт стоит ПОСЛЕ последнего совпадения: только на такой сцене видно
	 * разницу между «последний в разметке» и «последний видимый».
	 */
	function trailingHidden(): { dd: DropDown; items: HTMLElement[] } {
		const select = makeSelect([
			["a", "Alpha"],
			["c", "Alps"],
			["b", "Beta"],
		]);
		select.setAttribute("data-search-on", "true");

		const dd = new DropDown(select);
		const root = dd.element!;
		(root.querySelector(".view") as HTMLElement).dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true })
		);

		const search = root.querySelector('input[type="search"]') as HTMLInputElement;
		search.value = "al";
		search.dispatchEvent(new Event("input", { bubbles: true }));

		const items = [...root.querySelectorAll("li")] as HTMLElement[];
		expect(items.map((li) => li.classList.contains("ok"))).toEqual([true, true, false]);

		return { dd, items };
	}

	it("ArrowDown skips the items the search hid", () => {
		const { items } = filtered();

		option(items[0]).focus();
		arrow(option(items[0]), "ArrowDown");

		expect(document.activeElement).toBe(option(items[2]));
	});

	it("ArrowUp skips them too", () => {
		const { items } = filtered();

		option(items[2]).focus();
		arrow(option(items[2]), "ArrowUp");

		expect(document.activeElement).toBe(option(items[0]));
	});

	// дальше по списку видимых пунктов нет — фокус остаётся, а не уезжает на скрытый
	it("keeps focus put at the last visible match", () => {
		const { items } = trailingHidden();

		option(items[1]).focus();
		arrow(option(items[1]), "ArrowDown");

		expect(document.activeElement).toBe(option(items[1]));
	});

	// Tab с последнего ВИДИМОГО совпадения уводит фокус из контрола, и список надо закрыть:
	// проверка по порядку разметки его не закрывала — за Alps в разметке стоит скрытая Beta,
	// и раскрытый список оставался висеть вместе с классом на body и слушателями закрытия.
	it("closes the list on Tab from the last visible match", () => {
		const { dd, items } = trailingHidden();

		option(items[1]).focus();
		option(items[1]).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));

		expect(dd.element!.classList.contains("expanded")).toBe(false);
	});

	// а с непоследнего — не закрывает: работа в списке продолжается
	it("keeps the list open on Tab from a match that has another one after it", () => {
		const { dd, items } = trailingHidden();

		option(items[0]).focus();
		option(items[0]).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));

		expect(dd.element!.classList.contains("expanded")).toBe(true);
	});

	// без поиска ходить по-прежнему можно по всем пунктам
	it("walks every item when nothing is filtered", () => {
		const dd = new DropDown(
			makeSelect([
				["a", "Alpha"],
				["b", "Beta"],
			])
		);
		const items = [...dd.element!.querySelectorAll("li")] as HTMLElement[];

		option(items[0]).focus();
		arrow(option(items[0]), "ArrowDown");

		expect(document.activeElement).toBe(option(items[1]));
	});
});

// Негодный порог оставляет умолчание, а не выключает поиск: `parseInt` отдавал на нём NaN,
// а `количество >= NaN` всегда ложно — опечатка в атрибуте выходила хуже, чем его отсутствие.
describe("DropDown data-search-on parsing", () => {
	const twenty = (): HTMLSelectElement => {
		const opts: Array<[string, string]> = [];
		for (let i = 0; i < 20; i++) opts.push([`${i}`, `Option ${i}`]);

		return makeSelect(opts);
	};

	it("falls back to the default threshold on a value that is not a number", () => {
		const select = twenty();
		select.setAttribute("data-search-on", "yes");

		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			const dd = new DropDown(select);

			expect(dd.searchOn).toBe(DROPDOWN.VALUE.SEARCH_ON);
			expect(dd.element!.classList.contains("searchable")).toBe(true);
			expect(error).toHaveBeenCalled(); // молча проигнорированный атрибут не найти
		} finally {
			error.mockRestore();
		}
	});

	it("never leaves NaN in the public threshold", () => {
		const error = jest.spyOn(console, "error").mockImplementation(() => {});
		try {
			for (const value of ["yes", "1.5", "-3", "", "  ", "abc", "3px"]) {
				const select = twenty();
				select.setAttribute("data-search-on", value);

				expect(Number.isNaN(new DropDown(select).searchOn)).toBe(false);
			}
		} finally {
			error.mockRestore();
		}
	});

	it("still reads a whitespace-padded number", () => {
		const select = twenty();
		select.setAttribute("data-search-on", " 3 ");

		expect(new DropDown(select).searchOn).toBe(3);
	});
});
