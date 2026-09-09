/**
 * Anchored positioning for a floating surface: a popup by its button, a tooltip by a word,
 * a list by its field.
 *
 * Before this module every caller wrote the coordinates itself. A kit consumer did it with a rule
 * like `left: calc(100% + 10px)`, and such a popup simply ran off the right edge of the screen;
 * inside the set itself the calculation was written twice and differently — the editor toolbar
 * clamped itself to the edges but never flipped, the dropdown list flipped but never clamped.
 * Here both live together in one place.
 *
 * The calculation is deliberately separated from the DOM: {@link computePosition} takes rectangles
 * as numbers and returns numbers. That way it is visible as a whole and every corner case can be
 * tested — and there are more of them than it seems: does not fit below, fits neither below nor
 * above, wider than the screen, anchor off-screen. The DOM part ({@link positionElement},
 * {@link trackPosition}) stays thin: measure, call the calculation, write.
 *
 * Coordinates are viewport-relative and the element is placed `position: fixed`. Otherwise we would
 * have to find the nearest positioned ancestor and subtract its offset, and any `overflow: hidden`
 * along the way would clip the popup. The price is that scrolling the page moves the anchor out
 * from under the element — that is what {@link trackPosition} is for.
 *
 * Reachable as its own entry (`@brandup/ui-kit/position`) for the same reason as `./env`: the input
 * base needs it to show a validation message by the field, and it must not pull in the kit's main
 * entry, which brings the popup, the modal window, the styles and `@brandup/ui-app` along with it.
 * The module imports nothing at all, so the narrow entry costs a consumer exactly this file.
 */

/** The side of the anchor the element is pressed against. */
export type Side = "top" | "bottom" | "left" | "right";

/**
 * Alignment along the side: `start` — by the left (top) edge of the anchor, `end` — by the right
 * (bottom) one, `center` — by the middle.
 */
export type Align = "start" | "center" | "end";

/** Where to put it: the side and, after a hyphen, the alignment along it. */
export type Placement = Side | `${Side}-${Align}`;

/** A rectangle in viewport coordinates — the same thing `getBoundingClientRect` returns. */
export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface PositionOptions {
	/** Where to put it when there is room. `bottom-start` by default. */
	placement?: Placement;
	/** The gap between the anchor and the element. 4 by default. */
	gap?: number;
	/** How close to the edge of the screen the element is allowed to come. 8 by default. */
	viewportPadding?: number;
	/**
	 * The box the element has to stay inside, in viewport coordinates. The whole viewport by
	 * default, which is what every calculation here used to assume.
	 *
	 * Given when something smaller than the screen will cut the element off — an ancestor with
	 * `overflow: hidden`, a panel that scrolls. The screen says there is room, the box says there
	 * is not, and it is the box the reader actually sees. {@link clippingRect} works one out from
	 * the DOM; the DOM helpers here pass it in on their own.
	 */
	boundary?: Rect;
	/** Flip to the opposite side when there is no room on the requested one. Yes by default. */
	flip?: boolean;
	/**
	 * What to do when the element fits on neither side. Only consulted when {@link flip} is on.
	 *
	 * `keep` (default) — stay on the requested side: there the element is at least where it was
	 * asked for, and the shift will press it to the edge anyway. `bestFit` — take the side with more
	 * room, which is what a long menu on a short screen wants: it will be cut off either way, and
	 * the side with more room shows more of it.
	 */
	fallback?: "keep" | "bestFit";
	/**
	 * Swap the alignment along the side (`start` <-> `end`) when the element runs off the screen with
	 * the requested one. Off by default — the alignment is usually a deliberate choice, and swapping
	 * it moves the element to the other end of the anchor, which is a bigger jump than a shift.
	 *
	 * This is the second axis of {@link flip}: that one changes the side, this one the end of it.
	 * Note that it answers to the edge of the SCREEN, like everything else here — an element hanging
	 * out of its own container, but still on screen, is not overflow as far as this is concerned.
	 *
	 * `center` has no opposite, so it is tried first and then both ends, in that order.
	 */
	flipAlign?: boolean;
	/** Shift along the side so as not to run off the edge of the screen. Yes by default. */
	shift?: boolean;
	/**
	 * Also press the element across the side, into the screen. Off by default: across the side the
	 * element is held to the anchor by the gap, and moving it there tears it away from what it
	 * belongs to — a menu would stop touching its button.
	 *
	 * Wanted by a surface that belongs to the whole field rather than to a point on it: the editor
	 * toolbar stands above the text, and above the topmost line there is no room — better to keep
	 * it on screen, overlapping the text, than to let it leave.
	 */
	clampCross?: boolean;
}

export interface PositionResult {
	left: number;
	top: number;
	/**
	 * Where the element ended up: after a flip or an alignment swap this is not what was asked for.
	 *
	 * Always in full `side-align` form, even when the request was a bare side — asking for `bottom`
	 * gives back `bottom-center`, because that is what a bare side means. So this is not to be
	 * compared with the {@link PositionOptions.placement} that was passed in; read {@link side} and
	 * {@link align} instead, which is what the tail of a tooltip and the direction it appears from
	 * are drawn by.
	 */
	placement: Placement;
	/** The side the element ended up on, apart — so as not to have to parse {@link placement}. */
	side: Side;
	/** The alignment it ended up with, likewise. */
	align: Align;
}

/** Element size in pixels — what the measurement gives to the calculation. */
export interface Size {
	width: number;
	height: number;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const parse = (placement: Placement): [Side, Align] => {
	const [side, align] = placement.split("-") as [Side, Align | undefined];

	return [side, align ?? "center"];
};

/**
 * The coordinate along the side: the same arithmetic for both axes, so it is written once and
 * called with the fields of whichever axis the side runs along.
 */
const along = (start: number, extent: number, size: number, align: Align) => {
	if (align === "start") return start;
	if (align === "end") return start + extent - size;

	return start + (extent - size) / 2;
};

/** Puts the element by the side of the anchor, not yet caring about the edges of the screen. */
function place(anchor: Rect, size: Size, side: Side, align: Align, gap: number) {
	const alongX = () => along(anchor.left, anchor.width, size.width, align);
	const alongY = () => along(anchor.top, anchor.height, size.height, align);

	switch (side) {
		case "top":
			return { left: alongX(), top: anchor.top - size.height - gap };
		case "bottom":
			return { left: alongX(), top: anchor.top + anchor.height + gap };
		case "left":
			return { left: anchor.left - size.width - gap, top: alongY() };
		case "right":
			return { left: anchor.left + anchor.width + gap, top: alongY() };
	}
}

/** Whether the box fits whole between the edges with the padding. */
const fits = (start: number, length: number, min: number, max: number, padding: number) =>
	start >= min + padding && start + length <= max - padding;

/**
 * How much room there is between the anchor and the edge of the screen on the given side — the gap
 * and the viewport padding already taken out, so the number is the length the element may occupy.
 *
 * Used only to choose between two sides that both fail to fit: {@link fits} answers whether an
 * element fits, this answers which failure is the lesser one.
 */
function roomOn(anchor: Rect, bounds: Rect, side: Side, gap: number, padding: number) {
	switch (side) {
		case "top":
			return anchor.top - bounds.top - gap - padding;
		case "bottom":
			return bounds.top + bounds.height - padding - (anchor.top + anchor.height + gap);
		case "left":
			return anchor.left - bounds.left - gap - padding;
		case "right":
			return bounds.left + bounds.width - padding - (anchor.left + anchor.width + gap);
	}
}

const OPPOSITE_ALIGN: Record<Align, Align> = { start: "end", end: "start", center: "center" };

/**
 * Alignments to try, in order of preference: the requested one first, then what to fall back to.
 * `center` has no opposite, so both ends follow it.
 */
const alignCandidates = (align: Align): Align[] =>
	align === "center" ? ["center", "start", "end"] : [align, OPPOSITE_ALIGN[align]];

/** Presses the coordinate to the edges; a box wider than the room available goes to the near edge. */
const clamp = (start: number, length: number, min: number, max: number, padding: number) => {
	const furthest = max - padding - length;
	// The upper bound can turn out to be lower than the lower one — the element is longer than the
	// room it has. Then `Math.min` first takes it past the near edge and `Math.max` brings it back:
	// the beginning is visible rather than the middle.
	return Math.max(min + padding, Math.min(start, furthest));
};

/**
 * Works out where the element should stand.
 *
 * The order is this: first choose the side — stay on ours or flip over — and only then shift along
 * it. The other way round would be wrong: a shift along the side does not affect whether the
 * element fits across it, whereas the chosen side decides what to shift along.
 */
export function computePosition(
	anchor: Rect,
	size: Size,
	viewport: { width: number; height: number },
	options: PositionOptions = {}
): PositionResult {
	const {
		gap = 4,
		viewportPadding: padding = 8,
		boundary,
		flip = true,
		fallback = "keep",
		flipAlign = false,
		shift = true,
		clampCross = false,
	} = options;
	const [wanted, wantedAlign] = parse(options.placement ?? "bottom-start");

	// The box the element has to stay inside. Without a boundary of its own that is the whole
	// viewport, which is what it always used to be; a caller that knows the element will be clipped
	// by something smaller hands that in instead (see `clippingRect`).
	const bounds: Rect = boundary ?? { left: 0, top: 0, width: viewport.width, height: viewport.height };
	const edges = {
		vertical: [bounds.top, bounds.top + bounds.height] as const,
		horizontal: [bounds.left, bounds.left + bounds.width] as const,
	};

	// A flip keeps the axis — top swaps with bottom, left with right — so the axis is decided by
	// the requested side once, and the flip, the alignment and the shift below all read the same
	// answer. Across the side lies the choice of side; along it, the alignment.
	const vertical = wanted === "top" || wanted === "bottom";

	let side = wanted;

	if (flip) {
		const [min, max] = vertical ? edges.vertical : edges.horizontal;
		const length = vertical ? size.height : size.width;
		const opposite = OPPOSITE[wanted];

		// Across the side the position does not depend on the alignment, so the requested one is
		// good enough to measure with — the alignment is chosen below, once the side is known.
		const room = (s: Side) => {
			const at = place(anchor, size, s, wantedAlign, gap);

			return fits(vertical ? at.top : at.left, length, min, max, padding);
		};

		if (!room(wanted)) {
			// Fits on the other side — go there.
			if (room(opposite)) side = opposite;
			// Fits on neither: stay where we were asked to, unless told to take the roomier side.
			else if (
				fallback === "bestFit" &&
				roomOn(anchor, bounds, opposite, gap, padding) > roomOn(anchor, bounds, wanted, gap, padding)
			)
				side = opposite;
		}
	}

	// The alignment runs along the side, so it is measured on the other axis than the flip above.
	let align = wantedAlign;

	if (flipAlign) {
		const [min, max] = vertical ? edges.horizontal : edges.vertical;
		const length = vertical ? size.width : size.height;

		const found = alignCandidates(wantedAlign).find((candidate) => {
			const at = place(anchor, size, side, candidate, gap);

			return fits(vertical ? at.left : at.top, length, min, max, padding);
		});

		// None of them fits — keep the requested one, as the side does in the same situation; the
		// shift below will press the element to the edge.
		if (found) align = found;
	}

	const at = place(anchor, size, side, align, gap);
	const placement: Placement = `${side}-${align}`;
	const chosen = { placement, side, align };

	// Along the side — the shift; across it — only if asked (see `clampCross`). By default the
	// element stays where the gap put it: pressing it across would tear it away from the anchor.
	const alongAxis = (start: number, length: number, [min, max]: readonly [number, number]) =>
		shift ? clamp(start, length, min, max, padding) : start;
	const crossAxis = (start: number, length: number, [min, max]: readonly [number, number]) =>
		clampCross ? clamp(start, length, min, max, padding) : start;

	return vertical
		? {
				left: alongAxis(at.left, size.width, edges.horizontal),
				top: crossAxis(at.top, size.height, edges.vertical),
				...chosen,
			}
		: {
				left: crossAxis(at.left, size.width, edges.horizontal),
				top: alongAxis(at.top, size.height, edges.vertical),
				...chosen,
			};
}

/** Viewport size without the scrollbar: `innerWidth` counts it too, and the edge would go under it. */
const viewportOf = (elem: HTMLElement) => {
	const root = elem.ownerDocument.documentElement;

	return { width: root.clientWidth, height: root.clientHeight };
};

/**
 * The inline properties this module writes — and therefore the ones it has to give back.
 *
 * The margin is listed as its four longhands rather than as `margin`, because the shorthand cannot
 * be read back: `style.getPropertyValue("margin")` answers with an empty string unless all four
 * sides are set inline, so a host that wrote `style="margin-left: 17px"` was snapshotted as having
 * written nothing — and {@link clearPosition} then removed the shorthand, taking that 17px with it.
 * The longhands are readable one by one whichever way the host set them.
 */
const OWNED = [
	"position",
	"left",
	"top",
	"right",
	"bottom",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
] as const;

/**
 * The inline styles the element had before we took it over.
 *
 * Without this {@link clearPosition} would leave the element in a different state than it was found
 * in: the host may have written `margin` or `top` on the popup itself, and wiping those is not ours
 * to do. Kept in a `WeakMap` so the element does not outlive its entry.
 */
const savedStyles = new WeakMap<HTMLElement, Record<string, string>>();

function takeOver(elem: HTMLElement) {
	if (savedStyles.has(elem)) return; // already ours — the first snapshot is the honest one

	const saved: Record<string, string> = {};
	for (const name of OWNED) saved[name] = elem.style.getPropertyValue(name);

	savedStyles.set(elem, saved);
}

/** Non-empty and not a keyword meaning "nothing set". */
const isSet = (value: string | undefined | null) => !!value && value !== "none" && value !== "normal";

/**
 * Whether the element establishes a containing block for `position: fixed` descendants. `transform`,
 * `perspective`, `filter` and friends do that, and inside such an ancestor fixed coordinates stop
 * being viewport ones.
 */
function createsFixedContainer(style: CSSStyleDeclaration): boolean {
	const willChange = style.willChange ?? "";
	const contain = style.contain ?? "";

	return (
		isSet(style.transform) ||
		isSet(style.perspective) ||
		isSet(style.filter) ||
		isSet((style as unknown as { backdropFilter?: string }).backdropFilter) ||
		/transform|perspective|filter/.test(willChange) ||
		/paint|layout|strict|content/.test(contain)
	);
}

/**
 * The ancestor `position: fixed` is resolved against, or `null` when that is the viewport.
 *
 * A page-transition wrapper with a `transform`, a panel with a `filter` — any of them turns itself
 * into the containing block, and coordinates written as viewport ones would land the popup offset
 * by that ancestor's own position, sometimes right off the screen.
 */
function fixedContainer(elem: HTMLElement): HTMLElement | null {
	const view = elem.ownerDocument.defaultView;
	if (!view) return null;

	for (let node = elem.parentElement; node && node !== elem.ownerDocument.documentElement; node = node.parentElement)
		if (createsFixedContainer(view.getComputedStyle(node))) return node;

	return null;
}

/**
 * How much to subtract from viewport coordinates to get into the container's system. Fixed
 * descendants are laid out from the padding box, so the border of the container counts.
 */
function containerOffset(container: HTMLElement): { left: number; top: number } {
	const view = container.ownerDocument.defaultView;
	const rect = container.getBoundingClientRect();
	const style = view?.getComputedStyle(container);

	return {
		left: rect.left + (parseFloat(style?.borderLeftWidth ?? "") || 0),
		top: rect.top + (parseFloat(style?.borderTopWidth ?? "") || 0),
	};
}

/** Overflow values that cut a box off. `visible` does not; `clip` and the scrolling ones do. */
const CLIPS = /auto|scroll|hidden|clip|overlay/;

/**
 * Where the clipping ancestors of the element start.
 *
 * Not simply its parent, because an ancestor only cuts off a positioned element when that element
 * is laid out inside it — that is, when its containing block is that ancestor or something within.
 * A `position: fixed` element is resolved against the viewport, so an `overflow: hidden` on the way
 * up does not touch it at all; unless some ancestor made itself the containing block with a
 * `transform` or a `filter`, and then the walk starts there. An absolutely positioned one starts at
 * its nearest positioned ancestor. Anything else is in the flow and starts at its parent.
 *
 * `null` — nothing can cut this element off but the screen.
 */
function clipStart(elem: HTMLElement): HTMLElement | null {
	const view = elem.ownerDocument.defaultView;
	if (!view) return null;

	const position = view.getComputedStyle(elem).position;

	if (position === "fixed") return fixedContainer(elem);
	if (position === "absolute") return (elem.offsetParent as HTMLElement | null) ?? elem.parentElement;

	return elem.parentElement;
}

/** The part of one box that lies inside the other. */
function intersect(a: Rect, b: Rect): Rect {
	const left = Math.max(a.left, b.left);
	const top = Math.max(a.top, b.top);

	return {
		left,
		top,
		width: Math.max(0, Math.min(a.left + a.width, b.left + b.width) - left),
		height: Math.max(0, Math.min(a.top + a.height, b.top + b.height) - top),
	};
}

/** An ancestor that cuts the element off, and along which axis it does so. */
interface Clipper {
	node: HTMLElement;
	x: boolean;
	y: boolean;
	/** Border widths, read once: they do not change while the page is being scrolled. */
	borderLeft: number;
	borderTop: number;
}

/**
 * The ancestors that cut the element off.
 *
 * Split from measuring them because the two go stale at different rates. Which ancestors clip, and
 * along which axis, is a question for the stylesheet and changes only when the page does; where
 * they are is a question for the layout and changes on every scroll. Keeping them together meant
 * either asking the stylesheet every frame or trusting a boundary from before the scroll.
 *
 * The two axes are asked separately on purpose: `overflow-x: clip` with `overflow-y: visible` is a
 * real and useful pair — clip sideways, let things unfold downwards — and treating a box as
 * clipping in both directions because it clips in one would take away exactly the room that pair
 * was written to leave.
 *
 * `body` and `documentElement` are left out, as they are in {@link scrollParents}: page-level
 * overflow is the viewport's business, and the kit itself puts `overflow: hidden` on the body while
 * a popup window is open, which is about holding the page still rather than about cutting anything
 * off.
 */
function clippingAncestors(elem: HTMLElement): Clipper[] {
	const doc = elem.ownerDocument;
	const view = doc.defaultView;
	if (!view) return [];

	const clippers: Clipper[] = [];

	for (
		let node = clipStart(elem);
		node && node !== doc.body && node !== doc.documentElement;
		node = node.parentElement
	) {
		const style = view.getComputedStyle(node);
		const x = CLIPS.test(style.overflowX);
		const y = CLIPS.test(style.overflowY);
		if (!x && !y) continue;

		clippers.push({
			node,
			x,
			y,
			borderLeft: parseFloat(style.borderLeftWidth) || 0,
			borderTop: parseFloat(style.borderTopWidth) || 0,
		});
	}

	return clippers;
}

/**
 * The screen narrowed by each of those ancestors, in viewport coordinates.
 *
 * The padding box is measured rather than the border box, so an element is not placed under a
 * scrollbar of the box that holds it.
 */
function boundsOf(clippers: Clipper[], elem: HTMLElement): Rect {
	const viewport = viewportOf(elem);
	let rect: Rect = { left: 0, top: 0, width: viewport.width, height: viewport.height };

	for (const clipper of clippers) {
		const box = clipper.node.getBoundingClientRect();
		const inside: Rect = {
			left: box.left + clipper.borderLeft,
			top: box.top + clipper.borderTop,
			width: clipper.node.clientWidth,
			height: clipper.node.clientHeight,
		};

		// Only along the axis the box actually cuts: the other one keeps whatever it had.
		rect = intersect(rect, {
			left: clipper.x ? inside.left : rect.left,
			width: clipper.x ? inside.width : rect.width,
			top: clipper.y ? inside.top : rect.top,
			height: clipper.y ? inside.height : rect.height,
		});
	}

	return rect;
}

/**
 * The box the element can actually be seen in: the screen, narrowed by every ancestor that cuts it
 * off, in viewport coordinates.
 *
 * This is what the screen alone cannot answer. A page wrapper with `overflow: hidden` is as tall as
 * its content, so a menu unfolding below the last thing on the page is cut by the page's own bottom
 * edge while the viewport still reports room to spare — and the calculation, asking the screen,
 * keeps the menu where it is cut.
 */
export function clippingRect(elem: HTMLElement): Rect {
	return boundsOf(clippingAncestors(elem), elem);
}

/**
 * Measures the element for the calculation.
 *
 * The size is read with the coordinates cleared: a box squeezed by a previous showing at the edge
 * of the screen would measure narrower than it needs and would stay that way for good. This is the
 * expensive half — it writes styles and reads the layout back — so callers that repeat themselves
 * ({@link trackPosition}) do it once rather than every frame.
 */
function measure(elem: HTMLElement): Size {
	takeOver(elem);

	elem.style.position = "fixed";
	elem.style.left = "0";
	elem.style.top = "0";
	elem.style.right = "auto";
	elem.style.bottom = "auto";
	elem.style.margin = "0";

	return { width: elem.offsetWidth, height: elem.offsetHeight };
}

/** Writes the result, translating it into the coordinate system the element is actually laid out in. */
function write(elem: HTMLElement, at: PositionResult, container: HTMLElement | null) {
	const offset = container ? containerOffset(container) : null;

	elem.style.left = `${Math.round(offset ? at.left - offset.left : at.left)}px`;
	elem.style.top = `${Math.round(offset ? at.top - offset.top : at.top)}px`;
}

/**
 * Puts the element by the anchor. Returns the chosen side — the tooltip tail and the direction of
 * appearance are drawn from it.
 *
 * The element is taken over from this call onwards, not just for the duration of it: it is left
 * `position: fixed` with `right`, `bottom` and the margins pinned, because the written coordinates
 * only hold while nothing else moves it. Whoever positions an element once and then goes on using
 * it for something else calls {@link clearPosition} to give those properties back — and one that is
 * repositioned again and again ({@link trackPosition} does exactly this) needs nothing in between.
 */
export function positionElement(elem: HTMLElement, anchor: HTMLElement, options: PositionOptions = {}): PositionResult {
	const size = measure(elem);
	const at = computePosition(anchor.getBoundingClientRect(), size, viewportOf(elem), {
		...options,
		boundary: options.boundary ?? clippingRect(elem),
	});

	write(elem, at, fixedContainer(elem));

	return at;
}

/**
 * Gives the element back its own styles: whatever inline values it had before {@link positionElement}
 * took it over are restored, and the properties it did not have are removed.
 */
export function clearPosition(elem: HTMLElement): void {
	const saved = savedStyles.get(elem);

	// Nothing was taken from this element, so there is nothing to give back — and wiping its
	// coordinates and margin would be taking something instead. That is what would happen to an
	// element positioned by the host itself and passed here by mistake, or to one cleared twice.
	if (!saved) return;

	savedStyles.delete(elem);

	// The margin goes first and as the shorthand, before the loop below puts the saved sides back.
	// Written as `margin: 0`, it is only reliably removed by that same name: removing the four
	// longhands one at a time undoes a shorthand in a browser, but jsdom keeps the shorthand and
	// ignores the removal — a `margin: 0` nobody asked for stayed on the element for good.
	elem.style.removeProperty("margin");

	for (const name of OWNED) {
		const value = saved[name];

		if (value) elem.style.setProperty(name, value);
		else elem.style.removeProperty(name);
	}
}

export interface TrackOptions extends PositionOptions {
	/**
	 * Whether to position at all right now. Asked on every recalculation, so the answer may change
	 * as things go — the window is now wider than the threshold, now narrower.
	 *
	 * Needed by anyone whose narrow screen looks different: below `@adaptive-tablet-small` the kit
	 * popup is shown as a window in the centre, and coordinates by the button are not needed then —
	 * more than that, they are harmful, because an inline style outweighs the rule and would drag
	 * the window back to the button.
	 */
	enabled?: () => boolean;
}

/** Overflow values that make an element a scroll container. */
const SCROLLABLE = /auto|scroll|overlay|hidden/;

/**
 * The scrollable ancestors of the anchor — the only ones whose scrolling moves the anchor out from
 * under the element.
 *
 * Listening on `window` in the capture phase would catch these too, but it would also fire on every
 * scroll of every unrelated panel and on scrolling inside the popup itself, forcing a reposition
 * each time for nothing.
 */
function scrollParents(anchor: HTMLElement): HTMLElement[] {
	const doc = anchor.ownerDocument;
	const view = doc.defaultView;
	if (!view) return [];

	const parents: HTMLElement[] = [];

	// body and documentElement are left out on purpose: page scrolling arrives as a `scroll` event
	// on the window, which is subscribed to separately.
	for (
		let node = anchor.parentElement;
		node && node !== doc.body && node !== doc.documentElement;
		node = node.parentElement
	) {
		const style = view.getComputedStyle(node);
		if (SCROLLABLE.test(style.overflowX + style.overflowY)) parents.push(node);
	}

	return parents;
}

/**
 * Puts the element by the anchor and keeps it there until the returned unsubscribe is called.
 *
 * The size is measured on the first run, on resize and when the element or the anchor actually
 * changes size — not on every frame: the measurement writes styles and reads the layout straight
 * back, and doing that per scroll frame makes the browser lay the page out twice a frame. While
 * scrolling, only the anchor moves, so only the coordinates are rewritten.
 */
export function trackPosition(elem: HTMLElement, anchor: HTMLElement, options: TrackOptions = {}): () => void {
	let size: Size | null = null;
	let container: HTMLElement | null = null;
	let clippers: Clipper[] = [];
	let positioned = false;

	const update = (remeasure: boolean) => {
		if (options.enabled && !options.enabled()) {
			// Only on the transition into the disabled state: while it holds, the element already
			// carries its own styles and clearing them again every frame is pure churn.
			if (positioned) {
				clearPosition(elem);
				positioned = false;
				size = null;
			}

			return;
		}

		if (remeasure || !size) {
			size = measure(elem);
			container = fixedContainer(elem);
			// Which ancestors clip is settled with the size, not per frame: that answer comes from
			// the stylesheet and does not change between two frames of a scroll. Where they are is
			// read below, every time — a clipping ancestor scrolls with the page, so a boundary
			// remembered from the last measurement would be wrong exactly while the page moves.
			clippers = clippingAncestors(elem);
		}

		positioned = true;

		write(
			elem,
			computePosition(anchor.getBoundingClientRect(), size, viewportOf(elem), {
				...options,
				boundary: options.boundary ?? boundsOf(clippers, elem),
			}),
			container
		);
	};

	// The first time — straight away: the element is already shown, and waiting for a frame would
	// let it blink in its old place.
	update(true);

	const view = elem.ownerDocument.defaultView;
	if (!view)
		return () => {
			if (positioned) clearPosition(elem);
		};

	// Beyond that — no more often than a frame: only the last value survives to the paint anyway.
	let frame = 0;
	let pendingMeasure = false;

	const schedule = (remeasure: boolean) => {
		pendingMeasure = pendingMeasure || remeasure;

		if (frame) return;

		frame = view.requestAnimationFrame(() => {
			frame = 0;

			const remeasureNow = pendingMeasure;
			pendingMeasure = false;

			update(remeasureNow);
		});
	};

	const onScroll = () => schedule(false);
	// Resizing changes both the room available and the size the element takes in it, so the
	// measurement has to be redone — that is the case the reset-and-measure trick exists for.
	const onResize = () => schedule(true);

	// Not only the window: the element and the anchor change size on their own too, and neither a
	// scroll nor a resize says so. A list that loads its rows, a submenu that unfolds, a field that
	// grows with its text — the coordinates were worked out for the old size, and the element is
	// left hanging over the edge or torn away from what it belongs to.
	//
	// The reported size is compared with the previous one, and that comparison is what keeps this
	// from spinning: `measure` clears the coordinates before reading, so an element whose width
	// depends on where it stands — a shrink-to-fit box pressed against the right edge — measures
	// wide and is then rendered narrow, which wakes the observer again. Since what the observer
	// reports is the settled size after the frame, the next report equals the last and the pass
	// stops there. (With the shift on, which is the default, this does not arise at all: the
	// element is placed where its measured size fits.)
	//
	// The very first report about an element is only ever remembered, never acted on: `observe`
	// delivers one straight away, saying what the size is rather than that it changed — and it was
	// measured and placed a moment ago by the first run above. Acting on it would buy every showing
	// an extra measurement, on the frame right after opening, for no change at all.
	const sizes = new WeakMap<Element, Size>();
	const observer = view.ResizeObserver
		? new view.ResizeObserver((entries) => {
				let changed = false;

				for (const entry of entries) {
					const box = entry.contentRect;
					const seen = sizes.get(entry.target);

					sizes.set(entry.target, { width: box.width, height: box.height });

					if (seen && (seen.width !== box.width || seen.height !== box.height)) changed = true;
				}

				if (changed) schedule(true);
			})
		: null;

	observer?.observe(elem);
	observer?.observe(anchor);

	const parents = scrollParents(anchor);
	for (const parent of parents) parent.addEventListener("scroll", onScroll, { passive: true });

	view.addEventListener("scroll", onScroll, { passive: true });
	view.addEventListener("resize", onResize, { passive: true });

	return () => {
		if (frame) view.cancelAnimationFrame(frame);

		observer?.disconnect();

		for (const parent of parents) parent.removeEventListener("scroll", onScroll);

		view.removeEventListener("scroll", onScroll);
		view.removeEventListener("resize", onResize);

		if (positioned) clearPosition(elem);
	};
}
