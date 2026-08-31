/**
 * @jest-environment node
 */

// Compiles popup.less and checks what actually shows a popup. A DOM is of no use here: jsdom applies
// no stylesheet, so the one rule this is about — which elements a selector reaches — is invisible to
// it. The text of the built CSS is not.

import path from "node:path";
import less from "less";

const KIT = path.join(__dirname, "..");

async function renderPopupCss(): Promise<string> {
	const source = `@import "${path.join(KIT, "source", "popup.less").replace(/\\/g, "/")}";`;
	const output = await less.render(source, { paths: [KIT, path.join(KIT, "source")], filename: "popup-test.less" });

	return output.css;
}

describe("popup.less", () => {
	// A popup is shown by its own class, which the manager sets on the popup element itself.
	//
	// There used to be a second way: a general sibling rule from the expanded initiator,
	// `.ui-popup-expanded ~ .ui-popup`. `~` cannot be aimed at one element — it matches every
	// following sibling — so wherever button/popup pairs lie in a row (a row of menus, the example's
	// anchored demo) pressing the first button made every popup after it visible at once, and all but
	// the opened one had no coordinates, because the manager positions only what it opened.
	it("shows a popup by its own class, not by a sibling of the initiator", async () => {
		const css = await renderPopupCss();

		expect(css).toContain(".ui-popup.ui-popup-opened");
		expect(css).not.toMatch(/\.ui-popup-expanded\s*~/);
	});

	// The class itself stays: a component styles its own button by it while the popup is open.
	it("keeps the expanded class free for the initiator's own styling", async () => {
		const css = await renderPopupCss();

		expect(css).not.toMatch(/~\s*\.ui-popup/);
	});
});

// Below the breakpoint the popup stops being a surface by a button and becomes a window in the
// middle of the screen. That is a change of mode, and it has to beat whatever a project wrote to
// place the popup by its button — rules a project nests as deep as its own markup happens to be.
//
// Weight cannot carry that on its own: the kit's selector is (0,2,1), and three nested classes
// already outrank it. When that happened, `left: calc(100% + 10px)` — harmless on an absolutely
// positioned box — pushed the now-fixed popup clean off the screen, leaving only the full-screen
// dimming visible.
describe("popup.less: window mode below the breakpoint", () => {
	const windowRule = async () => {
		const css = await renderPopupCss();
		const match = css.match(/body \.ui-popup\.ui-popup-opened\s*\{[^}]*\}/);

		expect(match).not.toBeNull();

		return match![0];
	};

	it("pins the geometry that defines the mode", async () => {
		const rule = await windowRule();

		// every property a project would set to place the popup by its button
		for (const property of ["position", "inset", "margin", "width", "max-width", "height", "max-height"])
			expect(rule).toMatch(new RegExp(String.raw`[;{]\s*${property}\s*:[^;}]*!important`));
	});

	// The window is sized by these, so they have to stay overridable — pinning the mode must not
	// take away the ability to tune it.
	it("leaves the window's own measurements tunable", async () => {
		const rule = await windowRule();

		expect(rule).toContain("--popup-window-inset");
		expect(rule).toContain("--popup-window-max-width");
	});

	// Read from script to decide whether to write coordinates at all; a project that overrides it is
	// doing so deliberately.
	it("declares the mode as a token for the manager", async () => {
		const rule = await windowRule();

		expect(rule).toMatch(/--popup-window-mode:\s*1/);
	});
});

// A closed popup has to leave the layout, not merely turn invisible. `visibility` keeps the box in
// the flow, and a popup is placed by the project — usually beside its button, with a `left` that
// puts it outside its parent. Below the breakpoint an open popup becomes a window with
// `overflow: auto`, so a closed submenu still sitting in the flow pushed the window's scrollable
// area past its own edge and grew scrollbars over nothing.
describe("popup.less: a closed popup", () => {
	it("is taken out of the layout rather than hidden in place", async () => {
		const css = await renderPopupCss();
		const base = css.match(/(^|})\s*\.ui-popup\s*\{[^}]*\}/);

		expect(base).not.toBeNull();
		expect(base![0]).toMatch(/display:\s*none/);
		expect(base![0]).not.toMatch(/visibility:/);
	});

	it("comes back into the layout with the opened class", async () => {
		const css = await renderPopupCss();
		const opened = css.match(/\.ui-popup\.ui-popup-opened\s*\{[^}]*\}/);

		expect(opened).not.toBeNull();
		expect(opened![0]).toMatch(/display:\s*block/);
	});
});
