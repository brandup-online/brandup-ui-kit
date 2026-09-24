/**
 * @jest-environment jsdom
 */

// The waiting state of a button, checked on the compiled stylesheet.
//
// A button waits under two names: `loading`, which the host sets by hand, and `executing`, which
// `@brandup/ui` sets on the element of an asynchronous command for as long as its promise runs. Both
// have to look the same — a project whose buttons run commands should not have to copy the ring into
// its own stylesheet, where it would stop following the kit. The views of the button declare colour
// by rules of the same weight as the state, so it is the order of the sheet that keeps the label
// hidden on a filled button, and that is what is counted here rather than read off the source.

import path from "node:path";
import { compileRules, declared, KIT_DIR, type Rule } from "../../../test/css-cascade";

const KIT = path.join(__dirname, "..");

const STATES = ["hover", "active", "disabled", "focus-visible"] as const;

const compile = (): Rule[] =>
	compileRules({
		entry: path.join(KIT, "source", "button.less"),
		paths: [KIT, path.join(KIT, "source")],
		states: STATES,
		lessFrom: KIT_DIR,
	});

function button(classes: string) {
	const elem = document.createElement("button");
	elem.className = `ui-button ${classes}`;

	document.body.appendChild(elem);

	return elem;
}

let rules: Rule[];

beforeAll(() => {
	rules = compile();
}, 30000);

afterEach(() => {
	document.body.innerHTML = "";
});

describe("a button waiting for a command", () => {
	it.each(["", "primary", "ghost", "primary danger"])("hides the label of %s as loading does", (view) => {
		const loading = button(`${view} loading`);
		const executing = button(`${view} executing`);

		for (const property of ["color", "pointer-events", "cursor"])
			expect(declared(rules, executing, property)).toBe(declared(rules, loading, property));

		expect(declared(rules, executing, "color")).toBe("transparent");
	});

	// A selector list shares one body, so both names reaching the same declarations means the ring
	// is one rule — not a copy that a later change to the ring would leave behind.
	it("draws the same ring", () => {
		const ring = (name: string) => rules.find((rule) => rule.matchable === `.ui-button.${name}::after`);

		expect(ring("loading")).toBeDefined();
		expect(ring("executing")?.declarations).toBe(ring("loading")?.declarations);
	});
});
