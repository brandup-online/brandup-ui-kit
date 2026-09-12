import { initUICommands } from "@brandup/ui";

// The file is shared by the whole run, while the suites' environments differ: almost all of them
// need jsdom, but the suite that reads the built CSS does not need a DOM at all and declares
// `@jest-environment node`. Everything below touches the DOM, so in a node environment it is
// skipped: otherwise the very first reference to `Element` brings such a suite down before it runs.
const HAS_DOM = typeof window !== "undefined" && typeof Element !== "undefined";

if (HAS_DOM) {
	// Register the global click handler for commands (@brandup/ui v2.0.2+).
	// In production Application.run() does this; in tests it is called explicitly.
	initUICommands();

	// jsdom does not implement scrollIntoView — stubbed so UI logic (InputControl.focus and the like) does not throw under tests.
	(Element.prototype as any).scrollIntoView = function () {};

	// Nor scrollTo, and its absence was not harmless: the dropdown scrolls its list to the chosen
	// option while opening, so the call threw in the middle of `__openPopup` — after the class and
	// the layer were in place, but before the listeners that close the list on a press outside it.
	// The throw was swallowed by the event dispatch, so every suite saw a list that looked open and
	// closed by rules it had never subscribed to.
	if (!(Element.prototype as any).scrollTo) (Element.prototype as any).scrollTo = function () {};

	// jsdom does not implement matchMedia either, and the kit asks it about the pointer
	// (`isCoarsePointer`) while the example asks it about the colour scheme — the latter at module
	// load, so without this every suite that reaches that module fails before its first test.
	// The stub answers "no match": the suites that care about a coarse pointer or a dark system
	// replace it with their own.
	if (!window.matchMedia) {
		window.matchMedia = (query: string): MediaQueryList => <MediaQueryList>(<unknown>{
				media: query,
				matches: false,
				onchange: null,
				addEventListener: () => {},
				removeEventListener: () => {},
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			});
	}

	// jsdom does not implement innerText — proxied to textContent. That is enough for UI logic
	// (for single lines without breaks innerText and textContent are the same).
	if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText")) {
		Object.defineProperty(HTMLElement.prototype, "innerText", {
			get() {
				return this.textContent ?? "";
			},
			set(value: string) {
				this.textContent = value;
			},
			configurable: true,
		});
	}
}
