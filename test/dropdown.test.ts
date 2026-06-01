/**
 * @jest-environment jsdom
 */
import DropDown, { ROOT_CLASS, CHANGE_EVENT } from "../npm/brandup-ui-dropdown/source/dropdown";

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

describe("DropDown", () => {
	it("wraps the select in a ui-dropdown container", () => {
		const select = makeSelect([["1", "One"]]);
		const dd = new DropDown(select);
		expect(dd.element?.classList.contains(ROOT_CLASS)).toBe(true);
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

	it("fires dropdown-change with new value/title when a list item is clicked", () => {
		const select = makeSelect([
			["a", "Alpha"],
			["b", "Beta"],
		]);
		const dd = new DropDown(select);
		const handler = jest.fn();
		dd.on(CHANGE_EVENT, handler);

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

	it("destroy() removes the container and restores the original select to the DOM", () => {
		const select = makeSelect([["a", "Alpha"]]);
		const dd = new DropDown(select);
		const container = dd.element!;

		dd.destroy();

		expect(container.isConnected).toBe(false);
		expect(select.isConnected).toBe(true);
	});
});
