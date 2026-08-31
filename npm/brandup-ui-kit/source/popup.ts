import { LayerManager, type Layer } from "./layer";
import { trackPosition, type PositionOptions } from "./position";
import { UIKIT } from "./names";
import "./popup.less"; // styles of the floating surface

/** Popup names live in the kit's shared names module (see names.ts). */
const POPUP = UIKIT.POPUP;

type OpenPopup = {
	initiator?: HTMLElement;
	popup: HTMLElement;
	closeCallback?: () => void;
	layer: Layer;
	/** Stop tracking the anchor and give the popup its own coordinates back. */
	unposition?: () => void;
};

/**
 * Open popups, bottom to top.
 *
 * Neighbours evict each other — two menus in a header must not be open at once — while a nested one
 * lies on top of its parent: a submenu, an emoji picked from a panel, a second list inside an open
 * one. Kinship is decided by the initiator: a button standing inside an open popup opens a child
 * rather than replacing the parent (see {@link parentIndexFor}).
 *
 * A stack is needed both because there can be several popups open and because they have to be
 * closed apart: Escape takes the top one, a click inside a parent takes everything above it.
 */
const stack: OpenPopup[] = [];

let popupIdSeq = 0;

const top = (): OpenPopup | undefined => stack[stack.length - 1];

const indexOfPopup = (popupElem: HTMLElement): number => stack.findIndex((entry) => entry.popup === popupElem);

/**
 * The topmost open popup the element lies inside — that is, the one the press belongs to. `-1` when
 * the press landed outside all of them.
 */
function deepestContaining(target: Node): number {
	for (let i = stack.length - 1; i >= 0; i--) if (stack[i].popup.contains(target)) return i;

	return -1;
}

/**
 * The popup the initiator of the one being opened stands inside. That one becomes the parent:
 * closing it would mean closing a popup by a press on its own content.
 *
 * `-1` — there is no initiator at all, or it lies on the page: the popup is a standalone one, and
 * every open popup is a neighbour to it rather than kin.
 */
function parentIndexFor(initiator?: HTMLElement): number {
	return initiator ? deepestContaining(initiator) : -1;
}

/**
 * The popup whose button was pressed — that is, the one this press closes. `-1` when the press did
 * not land on the button of an open popup.
 *
 * Searched top down: a submenu button is sometimes nested inside the element declared as the
 * parent's initiator (a wrapping button, a field with a button inside), and searching bottom up
 * would find the parent — closing along with it what the press never touched. The topmost match is
 * the one whose button was actually hit.
 *
 * An initiator that contains the popup itself does not count as a press on the button: with such
 * markup `initiator.contains` is true for the whole content of the popup, and a menu item would
 * close the popup instead of doing its job.
 */
function initiatedIndex(target: Node, insidePopup: HTMLElement | null): number {
	for (let i = stack.length - 1; i >= 0; i--) {
		const initiator = stack[i].initiator;
		if (!initiator || !initiator.contains(target)) continue;
		if (insidePopup && initiator.contains(insidePopup)) continue;

		return i;
	}

	return -1;
}

const closePopupEventHandler = (e: MouseEvent) => {
	const target = e.target as HTMLElement;

	// Which popup the press landed in comes first: it decides whether to read the press as a hit on
	// a button (see initiatedIndex) or as work inside an already open popup.
	const inside = deepestContaining(target);
	const insidePopup = inside >= 0 ? stack[inside].popup : null;

	// A press on the button of an already open popup is that popup's closing. The event is
	// swallowed: otherwise the `ui-popup-toggle` command bubbling up behind it would see the popup
	// closed and open it again.
	const initiated = initiatedIndex(target, insidePopup);
	if (initiated >= 0) {
		closeFrom(initiated);

		e.preventDefault();
		e.stopImmediatePropagation();

		return;
	}

	// The press landed inside a popup: that one stays, and everything above it has nothing to do
	// with this press — a submenu opened from it closes.
	closeFrom(inside + 1);
};

/**
 * The initiator button declares the state of the popup: `aria-expanded` is read by a screen reader,
 * `aria-controls` ties the button to the open layer. The popup is given an id of ours when the
 * markup did not set one.
 */
const setInitiatorState = (initiator: HTMLElement | undefined, popup: HTMLElement, expanded: boolean) => {
	if (!initiator) return;

	if (expanded) {
		if (!popup.id) popup.id = `${POPUP.ID}${++popupIdSeq}`;

		initiator.classList.add(POPUP.CLASS.EXPANDED);
		initiator.setAttribute("aria-controls", popup.id);
		initiator.setAttribute("aria-expanded", "true");
	} else {
		initiator.classList.remove(POPUP.CLASS.EXPANDED); // the last open context menu is closed
		initiator.setAttribute("aria-expanded", "false"); // the button stays a toggle when closed too
	}
};

/** Takes one popup down — on its own, without regard for the ones standing above it. */
const closeEntry = (entry: OpenPopup) => {
	// Off the stack first, before anything else. The `onClose` handler below is free to call closing
	// again — for this same popup or for the whole stack — and a popup already taken off here does
	// not exist for that second pass: it will not close twice and will not throw off the loop
	// walking the stack top down. No separate "closing in progress" flag is needed for that — being
	// in the stack or not already records the state.
	const index = stack.indexOf(entry);
	if (index < 0) return;
	stack.splice(index, 1);

	if (entry.closeCallback) entry.closeCallback();

	// Before the opened class comes off: tracking wrote inline coordinates onto the popup, and
	// leaving them would shift it on the next showing before it is recalculated.
	entry.unposition?.();

	setInitiatorState(entry.initiator, entry.popup, false);
	entry.popup.classList.remove(POPUP.CLASS.OPENED);

	// The listener comes off here rather than in the top-down closing: a popup is also closed past
	// it — Escape calls this method straight from the layer — and a listener removed only there
	// would outlive the last popup and run on every press on the page.
	if (!stack.length) document.body.removeEventListener("click", closePopupEventHandler);

	// last: the layer returns focus to the initiator, and that has to happen on an already closed popup
	entry.layer.release();
};

/**
 * Closes the popups from the given place upwards — top down, so that focus travels back along the
 * chain: from a submenu to its button in the parent rather than straight to the page.
 */
function closeFrom(index: number) {
	const from = Math.max(index, 0);

	// By the current top rather than by a counter: the `onClose` of the popup being closed may close
	// others, and the stack under a counted loop would get shorter than the loop thinks — it would
	// come to closing something that no longer exists. Each pass takes exactly one popup down, so
	// the loop terminates.
	while (stack.length > from) closeEntry(stack[stack.length - 1]);
}

/**
 * Close the popup and everything above it. Without an argument — close them all: whoever calls
 * `close()` about no particular popup should have none open at all.
 */
const close = (popupElem?: HTMLElement) => {
	if (!popupElem) {
		closeFrom(0);

		return;
	}

	const index = indexOfPopup(popupElem);
	if (index >= 0) closeFrom(index);
};

/**
 * Whether the popup is shown as a centred window rather than by its button. The stylesheet itself
 * declares this through the `--popup-window-mode` token inside the adaptive rule (see popup.less).
 */
function isWindowMode(popupElem: HTMLElement): boolean {
	return getComputedStyle(popupElem).getPropertyValue("--popup-window-mode").trim() === "1";
}

/**
 * The same flag, but asked of the stylesheet no more often than the answer changes.
 *
 * Anchor tracking calls it on every scroll frame, and `getComputedStyle` makes the browser
 * recalculate styles. The flag itself only changes when the viewport crosses
 * `@adaptive-tablet-small`, that is when the window width changes — so the answer is remembered
 * against that width for as long as the popup is shown.
 */
function windowModeCache(popupElem: HTMLElement): () => boolean {
	let width = -1;
	let value = false;

	return () => {
		const current = popupElem.ownerDocument.defaultView?.innerWidth ?? 0;

		if (current !== width) {
			width = current;
			value = isWindowMode(popupElem);
		}

		return value;
	};
}

/** The anchor to hold the popup at, or `undefined` when positioning was not asked for. */
function positionAnchor(options?: PopupOptions): HTMLElement | undefined {
	if (!options?.position) return undefined;

	const anchor = typeof options.position === "object" ? options.position.anchor : undefined;

	return anchor ?? options.initiator;
}

/** Calculation options: `position: true` has none, an object has everything but the anchor. */
function positionOptions(options?: PopupOptions): PositionOptions {
	return typeof options?.position === "object" ? options.position : {};
}

/**
 * Show the popup. One already opened by this same call stays open — a repeated `open` changes
 * nothing; closing it by a press on the same button is {@link toggle}'s job.
 *
 * A popup whose button stands inside an already open one lies on top of it — that is a submenu.
 * Every other popup is no kin to the open ones: they close, or the page would be left with two
 * menus hanging open.
 */
const open = (popupElem: HTMLElement, options?: PopupOptions) => {
	if (indexOfPopup(popupElem) >= 0) return; // already shown — nothing to open

	// Everything that is not the parent of the new popup is closed: neighbours go entirely, and the
	// parent loses the submenu it had open before.
	closeFrom(parentIndexFor(options?.initiator) + 1);

	popupElem.classList.add(POPUP.CLASS.OPENED);

	setInitiatorState(options?.initiator, popupElem, true);

	if (!stack.length) document.body.addEventListener("click", closePopupEventHandler);

	const entry: OpenPopup = {
		popup: popupElem,
		initiator: options?.initiator,
		closeCallback: options?.onClose,

		// Escape and the body class belong to the layer manager: a popup is sometimes open above a
		// modal window, and one press must not close them both (see layer.ts). The layer takes down
		// only its own popup — nested ones close one at a time, top down.
		//
		// Referring to `entry` inside its own initializer is legal: the closure is called on an
		// already built object, not now. There is no need for a placeholder field filled in
		// afterwards — a placeholder would be a lie to the type that nothing can check.
		layer: LayerManager.push({
			close: () => closeEntry(entry),
			element: popupElem,
			bodyClass: POPUP.CLASS.BODY,
			// Focus is not taken inside: a popup is opened without letting go of the caret in a
			// field (the emoji panel) — but if the user walked into it from the keyboard, closing
			// returns focus to the button.
			returnFocus: options?.initiator ?? null,
		}),
	};

	// Positioned on a popup already inserted into the document and already open: a hidden one has
	// the wrong size, and both the flip and the shift are calculated from it.
	const anchor = positionAnchor(options);
	if (anchor) {
		const windowMode = windowModeCache(popupElem);

		entry.unposition = trackPosition(popupElem, anchor, {
			...positionOptions(options),
			// Below `@adaptive-tablet-small` the popup is shown as a centred window and does not
			// need coordinates by the button — the stylesheet itself declares that (see
			// `--popup-window-mode` in popup.less), so the breakpoint does not also live as a
			// number in script.
			enabled: () => !windowMode(),
		});
	}

	stack.push(entry);
};

/**
 * Toggle the popup: show it, and close one that is open. This is the behaviour of a toggle button,
 * so it is what the `ui-popup-toggle` command uses, and anyone who opens a popup on a button press.
 *
 * Returns whether the popup is open after the call: showing its content and holding something for
 * the duration is only needed on `true`.
 */
const toggle = (popupElem: HTMLElement, options?: PopupOptions): boolean => {
	const index = indexOfPopup(popupElem);
	if (index >= 0) {
		closeFrom(index);

		return false;
	}

	open(popupElem, options);

	return true;
};

export const PopupManager: IPopupManager = {
	open,
	toggle,
	close,
	isOpened: (popupElem?: HTMLElement) => (popupElem ? indexOfPopup(popupElem) >= 0 : stack.length > 0),
	get count() {
		return stack.length;
	},
	get current() {
		return top()?.popup ?? null;
	},
};

interface IPopupManager {
	/**
	 * Show the popup. One already open stays open through this same call; a popup whose button
	 * stands inside an already open one lies on top of it, and every other one evicts the open ones.
	 */
	open: (popupElem: HTMLElement, options?: PopupOptions) => void;
	/** Show the popup, and close an open one along with what it opened. Returns whether it is open after the call. */
	toggle: (popupElem: HTMLElement, options?: PopupOptions) => boolean;
	/** Close the popup and everything above it; without an argument — close them all. */
	close: (popupElem?: HTMLElement) => void;
	/** Without an argument — whether any popup is open; with one — whether that particular popup is. */
	isOpened: (popupElem?: HTMLElement) => boolean;
	/** How many popups are open: the standalone one and the submenus opened from it. */
	readonly count: number;
	/** The topmost open popup — the one Escape goes to. `null` when none are open. */
	readonly current: HTMLElement | null;
}

interface PopupOptions {
	/**
	 * The button the popup was opened from. Besides the state for a screen reader it decides whose
	 * popup this is: a button standing inside another open popup opens a submenu, and the parent
	 * stays where it is.
	 */
	initiator?: HTMLElement;
	onClose?: () => void;
	/**
	 * Put the popup at an anchor and hold it there while it is open: flipping to the other side when
	 * it does not fit on its own, and shifting away from the edge of the screen (see position.ts).
	 *
	 * `true` — at the initiator with the defaults; an object — a side, gap and padding of one's own,
	 * while `anchor` names an anchor other than the button: a popup by a text field is opened by a
	 * button inside it, but has to stand by the whole field.
	 *
	 * Without this the popup keeps its own coordinates — the ones written in the project's markup.
	 * The kit does not touch them: a rule like `left: calc(100% + 10px)` worked before this option
	 * existed and goes on working.
	 */
	position?: boolean | (PositionOptions & { anchor?: HTMLElement });
}
