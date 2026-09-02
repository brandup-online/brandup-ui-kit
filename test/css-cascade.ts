// Resolving the cascade of a compiled stylesheet, for tests that ask which rule actually wins.
//
// Two things keep going wrong in this set's stylesheets, and neither is visible in the nested less
// source: which element a rule lands on, and which of two rules of equal weight the order leaves on
// top. Counting that by eye in review is what failed — repeatedly — so it is counted here instead,
// on the built CSS.
//
// The cascade is resolved for real rather than approximated: pseudo-classes are rewritten into
// attributes of the same specificity (`:hover` -> `[data-hover]`), the markup under test is built
// with those attributes, and the selector engine of the DOM says whether a selector applies. So
// descendant combinators, `:not()` and `:focus-within` are matched by an engine rather than by a
// guess, and specificity is counted on a selector the rewrite left weighing exactly the same.
//
// Shared because it was written twice and had to be fixed twice: the at-rule gap below went
// unnoticed in one copy while the other was already tripping over it.

import { execFileSync } from "node:child_process";
import path from "node:path";

/** One rule of the compiled sheet: the selector as the DOM can match it, and its declarations. */
export interface Rule {
	/** The selector with pseudo-classes rewritten into attributes — what `elem.matches` is given. */
	matchable: string;
	/** Position in the sheet. Decides between two rules of equal weight, as the cascade does. */
	order: number;
	declarations: Map<string, string>;
}

export interface CompileOptions {
	/** The less file to compile. */
	entry: string;
	/** Directories to resolve its imports against. */
	paths: string[];
	/** Pseudo-classes to rewrite into `[data-*]` attributes, without the colon. */
	states: readonly string[];
	/** Directory holding the `less` package (the kit's, unless a caller says otherwise). */
	lessFrom: string;
}

// less picks its own file reader, and under jsdom it takes the browser one — which knows nothing
// about the disk and answers "file not found" to the first `@import`. A suite that needs a DOM for
// the matching cannot simply switch environments, so the compilation goes out to a node process and
// the matching stays where the DOM is.
const RENDER = `
const path = require("node:path");
const less = require(path.join(process.env.LESS_FROM, "node_modules", "less"));
const entry = process.env.ENTRY.split(path.sep).join("/");
less.render('@import "' + entry + '";', { paths: JSON.parse(process.env.PATHS), math: "always" })
	.then((out) => process.stdout.write(out.css))
	.catch((error) => {
		process.stderr.write(String(error && error.message ? error.message : error));
		process.exit(1);
	});
`;

/**
 * Drops at-rule blocks (`@media`, `@supports`) before the rules are read.
 *
 * The parse below is flat and has no notion of nesting, so an at-rule's prelude would be taken for a
 * selector — `@media all and (max-width: ...)` is not one, and the selector engine refuses it. It
 * stays invisible until a test asks about a property that an at-rule also declares, and then it
 * fails as a syntax error from somewhere unrelated.
 *
 * What the callers ask about is the ordinary, wide-screen cascade; a narrow-screen sheet is a mode
 * of its own and would need its own test to say anything about it.
 */
export function stripAtRules(css: string): string {
	let out = "";

	for (let i = 0; i < css.length;) {
		const at = css.indexOf("@", i);
		const brace = at === -1 ? -1 : css.indexOf("{", at);

		if (at === -1 || brace === -1) {
			out += css.slice(i);
			break;
		}

		out += css.slice(i, at);

		let depth = 1;
		let j = brace + 1;
		while (j < css.length && depth > 0) {
			if (css[j] === "{") depth++;
			else if (css[j] === "}") depth--;
			j++;
		}

		i = j;
	}

	return out;
}

const rewrite = (selector: string, states: readonly string[]) =>
	states.reduce((result, state) => result.split(`:${state}`).join(`[data-${state}]`), selector);

/**
 * Specificity as (ids, classes/attributes/pseudo-classes, elements), counted on the rewritten
 * selector. `:not()` contributes its argument, which falls out on its own: the argument is left in
 * place and its attributes are counted like any others.
 */
export function specificity(selector: string): [number, number, number] {
	const bare = selector.replace(/:not\(|\)/g, " ");

	return [
		(bare.match(/#[\w-]+/g) ?? []).length,
		(bare.match(/\[[^\]]+\]/g) ?? []).length + (bare.match(/\.[\w-]+/g) ?? []).length,
		(bare.match(/(^|[\s>+~])[a-z]+/g) ?? []).length,
	];
}

const outweighs = (a: Rule, b: Rule) => {
	const [x, y] = [specificity(a.matchable), specificity(b.matchable)];

	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];

	return a.order > b.order; // equal weight — the one declared later
};

/** Compiles the stylesheet and hands back its rules in source order. */
export function compileRules(options: CompileOptions): Rule[] {
	const css = execFileSync(process.execPath, ["-e", RENDER], {
		encoding: "utf-8",
		maxBuffer: 32 * 1024 * 1024,
		env: {
			...process.env,
			LESS_FROM: options.lessFrom,
			ENTRY: options.entry,
			PATHS: JSON.stringify(options.paths),
		},
	});

	const rules: Rule[] = [];

	for (const [, selectors, body] of stripAtRules(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		const declarations = new Map<string, string>();
		for (const [, property, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g))
			declarations.set(property.trim(), value.trim());

		// A selector list is a set of separate rules sharing a body: each carries its own weight,
		// and only the one that matches counts.
		for (const selector of selectors.split(","))
			rules.push({
				matchable: rewrite(selector.trim().replace(/\s+/g, " "), options.states),
				order: rules.length,
				declarations,
			});
	}

	return rules;
}

/** The rule that wins for one property on the element itself, or nothing if none declares it. */
export function winningRule(rules: Rule[], elem: HTMLElement, property: string): Rule | undefined {
	let best: Rule | undefined;

	for (const rule of rules) {
		if (!rule.declarations.has(property)) continue;
		if (rule.matchable.includes("::")) continue; // a pseudo-element is a different box
		if (!elem.matches(rule.matchable)) continue;
		if (!best || outweighs(rule, best)) best = rule;
	}

	return best;
}

/** What the cascade settles on for one property, on the element itself. */
export const declared = (rules: Rule[], elem: HTMLElement, property: string): string | undefined =>
	winningRule(rules, elem, property)?.declarations.get(property);

/**
 * The value the element ends up with, inheritance included — for a custom property declared on the
 * root of a control and read on an element inside it, which is how the components here are written.
 */
export function inherited(rules: Rule[], elem: HTMLElement, property: string): string | undefined {
	for (let node: HTMLElement | null = elem; node; node = node.parentElement) {
		const value = declared(rules, node, property);
		if (value !== undefined) return value;
	}

	return undefined;
}

/** The kit's directory, where the `less` package lives for every suite here. */
export const KIT_DIR = path.join(__dirname, "..", "npm", "brandup-ui-kit");
