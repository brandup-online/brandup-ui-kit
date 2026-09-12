/**
 * @jest-environment jsdom
 */
import { resetTexts, setTexts } from "@brandup/ui-kit/i18n";
import DropDown from "../source/dropdown";
import { DROPDOWN } from "../source/names";
import ru from "../locale/ru.json";

beforeAll(() => {
	Element.prototype.scrollTo = Element.prototype.scrollTo ?? function () {};
});

afterEach(() => {
	resetTexts();
	document.body.innerHTML = "";
	document.body.className = "";
});

function makeDropDown(): DropDown {
	document.body.innerHTML = "";
	const select = document.createElement("select");
	document.body.appendChild(select);

	return new DropDown(select);
}

// A dictionary is not an object literal, so a stale key in it would pass the type check of
// setTexts unnoticed and simply never be read. Order is not part of it: the keys are compared
// as sets, so moving one in the file is not a failure.
it("the dictionary carries exactly the declared captions", () => {
	expect(Object.keys(ru)).toEqual(["dropdown"]);
	expect(Object.keys(ru.dropdown).sort()).toEqual(Object.keys(DROPDOWN.TEXT).sort());
});

it("the defaults are english", () => {
	const dd = makeDropDown();

	expect(dd.element.querySelector<HTMLElement>(`.${DROPDOWN.CLASS.ELEMENT.EMPTY}`)?.textContent).toBe("Empty list");
});

it("the application texts reach the markup", () => {
	setTexts(ru);

	const dd = makeDropDown();

	expect(dd.element.querySelector<HTMLElement>(`.${DROPDOWN.CLASS.ELEMENT.EMPTY}`)?.textContent).toBe("Список пуст");
});

// The caption of a single control stays the strongest: it says something about this control, while
// the application texts only say what the language is.
it("a data attribute wins over the application texts", () => {
	setTexts(ru);

	document.body.innerHTML = "";
	const select = document.createElement("select");
	select.dataset.emptytext = "Нет вариантов";
	document.body.appendChild(select);
	const dd = new DropDown(select);

	expect(dd.element.querySelector<HTMLElement>(`.${DROPDOWN.CLASS.ELEMENT.EMPTY}`)?.textContent).toBe(
		"Нет вариантов"
	);
});

it("texts registered after the control was built do not change it", () => {
	const dd = makeDropDown();

	setTexts(ru);

	expect(dd.element.querySelector<HTMLElement>(`.${DROPDOWN.CLASS.ELEMENT.EMPTY}`)?.textContent).toBe("Empty list");
});
