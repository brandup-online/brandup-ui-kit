/**
 * Makes `readonly` on a choice control mean what it looks like.
 *
 * HTML has no `readonly` attribute for a checkbox or a radio at all — the browser does not read it.
 * The kit's stylesheet draws such a control in a read-only look, but that is where it ends: Space
 * on the keyboard still toggles it, and a value the host considered fixed changes quietly.
 *
 * The action itself is cancelled here. We listen for `click` rather than `keydown`: the browser
 * turns Space on a choice control into a `click` of its own accord, so a single handler covers the
 * pointer, the keyboard, and an `elem.click()` call from someone else's code.
 *
 * In the capture phase and on the document — so the cancel happens before the host's handler gets
 * to the element: an event the host stopped would never reach us.
 *
 * The event is not stopped, only its default action: a press on a closed field stays an ordinary
 * press, so the host's own handler — the hint explaining why the field is fixed — still sees it.
 *
 * The subscription is set up as the module loads, as in `user-scroll`, and for the same reason: the
 * closed look is drawn by the kit's stylesheet, unconditionally, for everyone who includes it. Were
 * the behaviour to arrive with something else (registering a middleware, a call from application
 * code), some projects would have a control that looks closed and changes anyway — that is, exactly
 * the gap all of this is written for would still be there, just out of sight.
 *
 * What it does not do: `readonly` stays invisible to a screen reader — `aria-readonly` speaks for
 * it, and writing that on the element is the host's job. And it is not a substitute for `disabled`:
 * a disabled value is not submitted with the form while a read-only one is, which is usually the
 * point of reaching for `readonly`.
 */
const CHOICE_TYPES = new Set(["checkbox", "radio"]);

let listening = false;

const onClick = (e: MouseEvent) => {
	const target = e.target;
	if (!(target instanceof HTMLInputElement)) return;
	if (!CHOICE_TYPES.has(target.type) || !target.hasAttribute("readonly")) return;

	// The default action only — the toggle. The event itself is not stopped: a press on such a
	// control stays an ordinary press, and the host's handler (the hint explaining why the field is
	// closed) will see it.
	e.preventDefault();
};

/**
 * Arms the cancel. Called by the module itself as it loads; exposed for the tests. Repeated calls
 * do nothing — one listener on the document is all that is needed.
 */
export const enforceReadonlyChoice = (): void => {
	if (listening || typeof document === "undefined") return;

	listening = true;
	document.addEventListener("click", onClick, true);
};

// The function checks the environment itself: the package is also built where there is no document
// at all (server-side rendering).
enforceReadonlyChoice();
