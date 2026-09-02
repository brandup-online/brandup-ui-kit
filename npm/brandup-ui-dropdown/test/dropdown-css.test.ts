/**
 * @jest-environment jsdom
 */

// The dropdown's trigger is meant to be a copy of the kit's text field: the same border, the same
// fill, and the same answer to every state. So it is not compared with a list of expected token
// names — it is compared with the field itself. Both stylesheets are compiled, the cascade is
// resolved on each, and the two answers have to be the same string.
//
// Written this way because the divergences were invisible by eye: the trigger had no `readonly`
// look at all although the component sets the class, and its focus look sat on the button, which
// loses focus the moment the list opens. Both read as "nearly the same as a field" until compared.
//
// The cascade is resolved for real rather than approximated: pseudo-classes are rewritten into
// attributes of the same specificity (`:hover` -> `[data-hover]`), the markup is built with those
// attributes, and jsdom's own `matches()` says whether a selector applies — so descendant
// combinators and `:focus-within` are matched by a real engine rather than by a guess.

import path from "node:path";
import { compileRules, declared, inherited, KIT_DIR, type Rule } from "../../../test/css-cascade";
import { DROPDOWN } from "../source/names";

const PACKAGE = path.join(__dirname, "..");
const KIT = KIT_DIR;

/** The states a rule may ask about; each is rewritten into an attribute of the same weight. */
const STATES = ["hover", "focus-within", "focus", "user-invalid", "disabled"] as const;

const compile = (entry: string): Rule[] =>
	compileRules({
		entry,
		paths: [
			PACKAGE,
			path.join(PACKAGE, "source"),
			path.join(PACKAGE, "node_modules"),
			KIT,
			path.join(KIT, "source"),
		],
		states: STATES,
		lessFrom: KIT,
	});

/** The states a control can be in, named the same for both controls. */
interface Situation {
	hover?: boolean;
	focus?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	/** The dropdown only: the list is open, which is where its focus goes. */
	expanded?: boolean;
}

/** The kit's text field in that situation. */
function field(state: Situation) {
	document.body.innerHTML = `<input type="text" />`;

	const elem = document.querySelector("input") as HTMLElement;

	if (state.hover) elem.setAttribute("data-hover", "");
	if (state.focus) elem.setAttribute("data-focus", "");
	if (state.readonly) elem.setAttribute("readonly", "");
	if (state.disabled) elem.setAttribute("data-disabled", "");
	if (state.invalid) elem.setAttribute("data-user-invalid", "");

	return elem;
}

/** The dropdown's trigger in the same situation. */
function trigger(state: Situation) {
	document.body.innerHTML = `
		<div class="ui-dropdown">
			<button type="button" class="view"><span></span></button>
			<div class="ui-dropdown-popup" tabindex="0"><div class="content"></div></div>
		</div>`;

	const root = document.querySelector(".ui-dropdown") as HTMLElement;
	const view = document.querySelector(".view") as HTMLElement;

	if (state.readonly) root.classList.add("readonly");
	if (state.disabled) root.classList.add("disabled");
	if (state.invalid) root.classList.add("invalid");
	if (state.expanded) root.classList.add("expanded");

	// Focus on the control: on the button when the list is shut, in the popup once it is open —
	// either way `:focus-within` holds on the root.
	if (state.focus) {
		root.setAttribute("data-focus-within", "");
		if (!state.expanded) view.setAttribute("data-focus", "");
	}

	if (state.hover) view.setAttribute("data-hover", "");

	return view;
}

let inputRules: Rule[];
let dropdownRules: Rule[];

beforeAll(() => {
	inputRules = compile(path.join(KIT, "source", "inputs.less"));
	dropdownRules = compile(path.join(PACKAGE, "source", "dropdown.less"));
}, 60000);

afterEach(() => {
	document.body.innerHTML = "";
});

/**
 * What the field paints itself with, and what the trigger paints itself with, for the same
 * situation — as token expressions, so the two are comparable without resolving colours.
 *
 * The field writes the properties directly (`background: var(--hover--input-fill)`); the trigger
 * goes through the token (`--input-fill`), because its border is drawn by a pseudo-element that
 * has to read the same answer. Where the trigger declares no token of its own the value comes from
 * `:root` — that is, the same `var(--input-fill)` the field starts from.
 */
const paints = (state: Situation) => ({
	field: {
		fill: declared(inputRules, field(state), "background"),
		color: declared(inputRules, field(state), "color"),
		border: declared(inputRules, field(state), "border-color"),
	},
	trigger: {
		fill: inherited(dropdownRules, trigger(state), "--input-fill") ?? "var(--input-fill)",
		color: inherited(dropdownRules, trigger(state), "--input-color") ?? "var(--input-color)",
		border: inherited(dropdownRules, trigger(state), "--input-border-color") ?? "var(--input-border-color)",
	},
});

describe("the trigger answers every state the way the field does", () => {
	const situations: Array<[string, Situation]> = [
		["at rest", {}],
		["under the pointer", { hover: true }],
		["in focus", { focus: true }],
		["in focus with the pointer over it", { focus: true, hover: true }],
		["read-only", { readonly: true }],
		["read-only under the pointer", { readonly: true, hover: true }],
		["read-only in focus", { readonly: true, focus: true }],
		["disabled", { disabled: true }],
		["disabled under the pointer", { disabled: true, hover: true }],
		["invalid", { invalid: true }],
	];

	it.each(situations)("fills the same %s", (_, state) => {
		const { field: expected, trigger: actual } = paints(state);

		expect(actual.fill).toBe(expected.fill);
	});

	it.each(situations)("draws the same border %s", (_, state) => {
		const { field: expected, trigger: actual } = paints(state);

		expect(actual.border).toBe(expected.border);
	});
});

// The arrow is coloured by `--svg-fill`, and `.ui-dropdown .view` declares that token on the button
// itself. An element's own declaration beats an inherited one whatever the weight of the rule it
// came from, so a `--svg-fill` written in a state block on the root never reaches the arrow at all.
// It goes unnoticed in every state but this one, because there the token is set to the same thing
// `--input-color` already carries — and read-only is the state where those two differ.
describe("the arrow", () => {
	const arrow = (state: Situation) => declared(dropdownRules, trigger(state), "--svg-fill");

	it("follows the text colour when nothing is the matter", () => {
		expect(arrow({})).toBe("var(--input-color)");
	});

	// Asked for: a read-only list opens nothing, so its arrow is dimmed the way a disabled one is.
	it("is dimmed on a read-only control, as it is on a disabled one", () => {
		expect(arrow({ readonly: true })).toBe("var(--disabled--input-color)");
	});

	// The trap the rule above exists for: on the root it would lose to `.ui-dropdown .view`.
	it("takes the dimming from the button's own rule, not from the root", () => {
		trigger({ readonly: true });

		const root = document.querySelector(".ui-dropdown") as HTMLElement;

		expect(declared(dropdownRules, root, "--svg-fill")?.matchable).not.toBe(".ui-dropdown.readonly");
	});

	// Disabled says it outright too. It used to arrive by accident — the root set `--input-color`
	// to the dimmed colour and the button's base rule read it — so the declaration in the disabled
	// block looked like the thing doing the work while sitting somewhere it could not.
	it("is dimmed on a disabled control by a rule that actually reaches it", () => {
		expect(arrow({ disabled: true })).toBe("var(--disabled--input-color)");
	});

	it("is dimmed the same way whether the control is read-only or disabled", () => {
		expect(arrow({ readonly: true })).toBe(arrow({ disabled: true }));
	});

	it("takes the invalid colour on an invalid control", () => {
		expect(arrow({ invalid: true })).toBe("var(--invalid--input-color)");
	});

	// Every state now says it on the button, which is the only place the arrow reads it from.
	it("is never left to a declaration on the root, where it would not arrive", () => {
		for (const state of [{}, { readonly: true }, { disabled: true }, { invalid: true }]) {
			trigger(state);

			const root = document.querySelector(".ui-dropdown") as HTMLElement;

			expect(declared(dropdownRules, root, "--svg-fill")).toBeUndefined();
		}
	});
});

// The gap between the button and the list is written twice: as a `translateY` in the stylesheet,
// which draws it, and as a number in `names.ts`, which the side-choosing arithmetic subtracts from
// the room available. Nothing ties the two together, so this does.
describe("the gap between the button and the list", () => {
	const shift = (state: string) => {
		trigger({ expanded: true });

		const popup = document.querySelector(".ui-dropdown-popup") as HTMLElement;
		if (state) popup.classList.add(state);

		const transform = declared(dropdownRules, popup, "transform") ?? "";

		return Number(transform.match(/translateY\((-?[\d.]+)px\)/)?.[1]);
	};

	it("is the same number the stylesheet moves the list by", () => {
		expect(shift("")).toBe(DROPDOWN.VALUE.POPUP_GAP);
	});

	it("is the same the other way up", () => {
		expect(shift("top")).toBe(-DROPDOWN.VALUE.POPUP_GAP);
	});
});

// The script decides which way the list opens and says so with a class on the list element
// (`__positionPopup`). The rules that act on that class used to sit one level deeper, on the box
// inside the list, so they matched nothing: the class went on, and the list still opened downwards
// wherever there was no room. Which element a rule lands on is not visible in a nested stylesheet,
// which is why it is asked of the compiled one here.
describe("the class that turns the list over reaches the list", () => {
	const list = (state: string[]) => {
		trigger({ expanded: true });

		const popup = document.querySelector(".ui-dropdown-popup") as HTMLElement;
		for (const name of state) popup.classList.add(name);

		return popup;
	};

	it.each([
		["top", "bottom"],
		["right", "left"],
	])("acts on the list itself for .%s", (name, property) => {
		expect(declared(dropdownRules, list([name]), property)).toBeDefined();
	});

	// The box inside is not where the script puts the class, so nothing may be waiting for it there.
	it.each(["top", "right"])("has nothing waiting for .%s on the box inside", (name) => {
		trigger({ expanded: true });

		const content = document.querySelector(".content") as HTMLElement;
		content.classList.add(name);

		for (const rule of dropdownRules)
			if (content.matches(rule.matchable)) expect(rule.matchable).not.toContain(`.content.${name}`);
	});
});

// The list is open, so the focus has moved off the button into the popup — the state the old rule
// could not see, because it was written on the button itself.
describe("the trigger holds its focus look while the list is open", () => {
	it("keeps the focus border and fill of a field in focus", () => {
		const open = paints({ focus: true, expanded: true });
		const focused = paints({ focus: true });

		expect(open.trigger.border).toBe(focused.field.border);
		expect(open.trigger.fill).toBe(focused.field.fill);
	});

	it("keeps them even if the focus went somewhere else entirely", () => {
		const { field: expected, trigger: actual } = paints({ expanded: true });

		expect(actual.border).toBe(expected.border.replace("--input-border-color", "--focus--input-border-color"));
	});

	it("does not light up a disabled control that somehow holds focus", () => {
		const { trigger: actual } = paints({ disabled: true, focus: true, expanded: true });

		expect(actual.border).toBe("var(--disabled--input-border-color)");
	});
});
