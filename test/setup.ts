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
