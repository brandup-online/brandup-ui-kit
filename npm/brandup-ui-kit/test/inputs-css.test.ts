/**
 * @jest-environment jsdom
 */

// Which rule wins on a choice control, checked on the compiled stylesheet.
//
// The states of a checkbox are drawn by rules of nearly equal weight — `:checked` fills it with the
// accent, `:hover` paints it in the field's colours, `[readonly]`, `:disabled` and `:user-invalid`
// each take it back — and the order they were declared in is doing as much work as the selectors
// are. That arithmetic has been got wrong twice already: a checked control with a validation error
// looked correct, and a locked one lit its border up under the cursor. Counting it by eye in a
// review is exactly what fails, so it is counted here.
//
// The cascade is resolved for real rather than approximated: pseudo-classes are rewritten into
// attributes of the same specificity (`:hover` -> `[data-hover]`), the element is built with those
// attributes, and jsdom's own `matches()` says whether a selector applies. Specificity is then
// counted on the rewritten selector — the rewrite preserves it exactly, an attribute and a
// pseudo-class both weighing (0,1,0).

import path from "node:path";
import { compileRules, declared, KIT_DIR, type Rule } from "../../../test/css-cascade";

const KIT = path.join(__dirname, "..");

/** The states a rule may ask about; each is rewritten into an attribute of the same weight. */
const STATES = ["hover", "checked", "indeterminate", "disabled", "user-invalid", "focus-visible"] as const;

type State = (typeof STATES)[number];

const compile = (): Rule[] =>
	compileRules({
		entry: path.join(KIT, "source", "inputs.less"),
		paths: [KIT, path.join(KIT, "source")],
		states: STATES,
		lessFrom: KIT_DIR,
	});

/** The control as the browser sees it in the given state. */
function control(type: "checkbox" | "radio", states: State[], attributes: Record<string, string> = {}) {
	const elem = document.createElement("input");
	elem.setAttribute("type", type);

	for (const [name, value] of Object.entries(attributes)) elem.setAttribute(name, value);
	for (const state of states) elem.setAttribute(`data-${state}`, "");

	document.body.appendChild(elem);

	return elem;
}

/** What the cascade settles on for one property, on an element in one state. */
const winner = declared;

let rules: Rule[];

beforeAll(() => {
	rules = compile();
}, 30000);

afterEach(() => {
	document.body.innerHTML = "";
});

describe("a choice control answers the pointer only when it is working", () => {
	it("lights up under the cursor when nothing stops it", () => {
		const elem = control("checkbox", ["hover"]);

		expect(winner(rules, elem, "border-color")).toBe("var(--hover--input-border-color)");
		expect(winner(rules, elem, "background-color")).toBe("var(--hover--input-fill)");
	});

	// The readonly rule repaints the background and says nothing about the border, so without the
	// exclusion on the hover rule a locked control still lit its border up under the cursor.
	it("keeps both the fill and the border of a locked control under the cursor", () => {
		const elem = control("checkbox", ["hover"], { readonly: "" });

		expect(winner(rules, elem, "background-color")).toBe("var(--readonly--input-fill)");
		expect(winner(rules, elem, "border-color")).not.toBe("var(--hover--input-border-color)");
	});

	it("keeps a disabled control dimmed under the cursor", () => {
		const elem = control("checkbox", ["hover", "disabled"]);

		expect(winner(rules, elem, "background-color")).toBe("var(--disabled--input-fill)");
		expect(winner(rules, elem, "border-color")).toBe("var(--disabled--input-border-color)");
	});

	it("keeps an invalid control red under the cursor", () => {
		const elem = control("checkbox", ["hover", "user-invalid"]);

		expect(winner(rules, elem, "background-color")).toBe("var(--invalid--input-fill)");
		expect(winner(rules, elem, "border-color")).toBe("var(--invalid--input-border-color)");
	});

	// A ticked control is filled with the accent, and the field's hover colours would wipe the mark
	// off it — so its hover is a darkening of that fill, declared by rules of its own.
	it("darkens a ticked control rather than repainting it", () => {
		for (const type of ["checkbox", "radio"] as const) {
			const elem = control(type, ["hover", "checked"]);

			expect(winner(rules, elem, "background-color")).toContain("color-mix");
			expect(winner(rules, elem, "background-color")).toContain("--checkbox-fill-checked");
		}
	});

	// The dash state is set from script only, and it is filled with the accent just as a tick is —
	// so it needs the same darkening, and would otherwise be repainted in the field's colours.
	it("darkens a partly-ticked control the same way", () => {
		const elem = control("checkbox", ["hover", "indeterminate"]);

		expect(winner(rules, elem, "background-color")).toContain("--checkbox-fill-checked");
	});

	it.each(["checkbox", "radio"] as const)("leaves a locked ticked %s alone under the cursor", (type) => {
		const elem = control(type, ["hover", "checked"], { readonly: "" });

		expect(winner(rules, elem, "background-color")).toBe("var(--checkbox-fill-checked)");
	});

	it("leaves a locked switch alone under the cursor", () => {
		const elem = control("checkbox", ["hover"], { role: "switch", readonly: "" });

		expect(winner(rules, elem, "background-color")).toBe("var(--readonly--input-fill)");
		expect(winner(rules, elem, "border-color")).not.toBe("var(--hover--input-border-color)");
	});

	it("darkens a switch that is on by its own colour", () => {
		const elem = control("checkbox", ["hover", "checked"], { role: "switch" });

		expect(winner(rules, elem, "background-color")).toContain("--toggler-round-fill");
	});

	it("leaves a ticked disabled control dimmed rather than darkened", () => {
		const elem = control("checkbox", ["hover", "checked", "disabled"]);

		expect(winner(rules, elem, "background-color")).toBe("var(--disabled--input-fill)");
	});
});

describe("a choice control shows where the keyboard is", () => {
	// `appearance: none` takes away the browser's own drawing of the control together with whatever
	// focus look came with it, so the ring has to be declared — and it is the kit's shared one, the
	// same a button and a modal's close cross show.
	it.each(["checkbox", "radio"] as const)("draws the kit's ring on %s", (type) => {
		const elem = control(type, ["focus-visible"]);

		expect(winner(rules, elem, "outline")).toBe("var(--focus-ring-width) solid var(--focus-ring-color)");
		expect(winner(rules, elem, "outline-offset")).toBe("var(--focus-ring-offset)");
	});

	it("draws it on a ticked control too, where the border is already the fill", () => {
		const elem = control("checkbox", ["focus-visible", "checked"]);

		expect(winner(rules, elem, "outline")).toBe("var(--focus-ring-width) solid var(--focus-ring-color)");
	});

	it("does not draw it on a control merely clicked with the mouse", () => {
		const elem = control("checkbox", []);

		expect(winner(rules, elem, "outline")).toBeUndefined();
	});
});

describe("the views stay apart", () => {
	// The switch is declared with the same tag and type as the checkbox, and its block does not
	// override every rule of it: without the exclusion the knob inherited the tick's two-sided
	// border and its 45 degree rotation.
	it("does not give the checkbox's box size to a switch", () => {
		const box = control("checkbox", []);
		const toggle = control("checkbox", [], { role: "switch" });

		expect(winner(rules, box, "width")).toBe("var(--checkbox-size)");
		expect(winner(rules, toggle, "width")).toBe("calc(var(--toggler-height) * 2)");
	});

	it("keeps a radio round whatever the field radius says", () => {
		const elem = control("radio", []);

		expect(winner(rules, elem, "border-radius")).toBe("50%");
	});
});

describe("подсказка в поле", () => {
	// Пустое поле должно отличаться от заполненного, а `inherit` — то, чем токен был раньше, —
	// давал подсказке ровно цвет набранного текста. Литеральный серый тоже не годится: на тёмной
	// теме он пропадает, поэтому цвет смешивается с заливкой поля и едет за темой.
	const placeholder = () => declared(rules, document.documentElement, "--placeholder-color");

	it("не повторяет цвет текста", () => {
		expect(placeholder()).not.toBe("inherit");
		expect(placeholder()).not.toBe(declared(rules, document.documentElement, "--input-color"));
	});

	it("выведена из темы, а не задана литералом", () => {
		expect(placeholder()).toMatch(/^color-mix\(.*var\(--/);
	});
});
