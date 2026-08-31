/**
 * @jest-environment node
 */

// less picks its own file reader, and under jsdom it takes the browser one — which knows nothing
// about the disk and answers "file not found" to the very first `@import`. This suite does not need
// a DOM at all: it reads the text of the built CSS.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import buildTheme from "../build/build-theme.cjs";

const { extractRootBlocks } = buildTheme;

// Component inputs are derived from the palette by a reference to its CSS token rather than by a
// computed value (see the header of the second part of vars.less). The difference is not visible in
// the built file by eye, yet it is lost the instant someone edits it: write `@input-fill: @surface`
// instead of `@input-fill: var(--surface)` and less bakes in a literal again — the built CSS stays
// valid, tests of the "it compiled" sort pass, and the dark theme, the client branding and the live
// preview quietly stop working.
//
// So it is not the values that are checked but the link itself: a derived token has to refer, not repeat.

const KIT = path.join(__dirname, "..");

/**
 * Builds the kit's theme on its own defaults and hands back the token declarations.
 *
 * Through `buildTheme` rather than a less compilation of our own: that is exactly the path the
 * theme takes to a project, and the link is worth checking on what will end up in `theme.css`
 * rather than on something like it. It requires a theme file — an empty one is given, so the
 * defaults from `vars.less` come into play.
 */
async function renderTokens(): Promise<Map<string, string>> {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "uikit-tokens-"));
	const theme = path.join(directory, "uikit.vars.less");
	fs.writeFileSync(theme, "", "utf-8");

	try {
		const css = await buildTheme({ theme, paths: [KIT] });
		const tokens = new Map<string, string>();

		// `:root` blocks only — through the same eyes the builder itself looks with. A token declared
		// inside a rule is not part of the theme: `.ui-button` redefines `--svg-fill: currentColor`
		// for itself, and a list collected indiscriminately would pass that off as the theme.
		for (const block of extractRootBlocks(css))
			for (const [, token, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g))
				tokens.set(token, value.trim());

		return tokens;
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

let tokens: Map<string, string>;

beforeAll(async () => {
	tokens = await renderTokens();
}, 30000);

describe("component inputs follow the palette", () => {
	// A pair of "derived token -> the token it is derived from". The list is deliberately not
	// exhaustive: what is here are the links that recolouring a site and the dark theme rest on —
	// colour, field size, and everything the button takes from the text field.
	const derived: Array<[string, string]> = [
		["--main-background", "--surface"],
		["--text-color", "--ink"],
		["--input-fill", "--surface"],
		["--input-color", "--text-color"],
		["--input-border-color", "--line"],
		["--input-border-width", "--border-width"],
		["--input-border-radius", "--radius"],
		["--input-height", "--control-height"],
		["--input-padding-lr", "--control-padding-lr"],
		["--hover--input-border-color", "--line-hover"],
		["--focus--input-border-color", "--accent"],
		["--checkbox-fill-checked", "--accent"],
		["--checkbox-mark", "--accent-contrast"],
		["--radio-dot", "--accent-contrast"],
		["--button-fill", "--input-fill"],
		["--button-color", "--text-color"],
		["--button-height", "--input-height"],
		["--button-radius", "--input-border-radius"],
		["--button-accent", "--focus--input-border-color"],
		["--button-accent-color", "--accent-contrast"],
		["--danger--button-accent", "--danger"],
		["--focus-ring-color", "--accent"],
		["--popup-fill", "--main-background"],
		["--popup-border-color", "--line"],
		["--popup-border-radius", "--radius-overlay"],
		["--svg-fill", "--text-color"],
	];

	it.each(derived)("%s refers to %s", (token, source) => {
		expect(tokens.get(token)).toBe(`var(${source})`);
	});

	// The palette is raw material and has nothing to refer to: the value is declared right here. A
	// reference in it would mean a circle — a token derived from itself.
	it.each([
		"--surface",
		"--ink",
		"--line",
		"--accent",
		"--accent-contrast",
		"--danger",
		"--space",
		"--radius",
		"--border-width",
		"--control-height",
	])("%s is a literal, not a reference", (token) => {
		expect(tokens.get(token)).not.toMatch(/^var\(/);
	});

	// The very case the link was set up for: a dark theme is an override of the palette rather than
	// an enumeration of a hundred inputs.
	it("a palette override reaches every derived token", () => {
		const palette = new Set([
			"--surface",
			"--ink",
			"--line",
			"--line-hover",
			"--accent",
			"--accent-contrast",
			"--danger",
		]);

		// Counting how many tokens the palette holds up: should there one day be noticeably fewer,
		// the link has been broken somewhere.
		const following = [...tokens.values()].filter((value) =>
			[...palette].some((name) => value.includes(`var(${name})`))
		);

		expect(following.length).toBeGreaterThanOrEqual(15);
	});
});
