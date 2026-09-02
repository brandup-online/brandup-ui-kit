/**
 * @jest-environment jsdom
 */
import {
	clearPosition,
	clippingRect,
	computePosition,
	positionElement,
	trackPosition,
	type PositionOptions,
	type Rect,
} from "../source/position";

// The calculation is separated from the DOM for the sake of this suite: jsdom lays nothing out and
// every size in it is zero, so there would be nothing to check "does not fit below — flip over"
// against on real elements. Here the rectangles are given as numbers, so it is the corner cases
// that are checked rather than the popup having ended up somewhere.

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 200, height: 100 };

/** A 100x20 anchor at the given point — the button a popup is opened at. */
const anchorAt = (left: number, top: number, width = 100, height = 20): Rect => ({ left, top, width, height });

const at = (anchor: Rect, options: PositionOptions = {}, size = SIZE, viewport = VIEWPORT) =>
	computePosition(anchor, size, viewport, options);

describe("computePosition: side and alignment", () => {
	it("stands under the anchor by its left edge by default", () => {
		const result = at(anchorAt(300, 300));

		expect(result).toEqual({ left: 300, top: 324, placement: "bottom-start", side: "bottom", align: "start" });
	});

	it("separates from the anchor by the gap rather than overlapping it", () => {
		expect(at(anchorAt(300, 300), { gap: 12 }).top).toBe(332);
	});

	it("presses to the anchor's right edge on end alignment", () => {
		// the anchor is 100 wide, the popup 200: the right edges meet, so the left goes 100 further left
		expect(at(anchorAt(300, 300), { placement: "bottom-end" }).left).toBe(200);
	});

	it("puts the middle under the middle on centre alignment", () => {
		expect(at(anchorAt(300, 300), { placement: "bottom-center" }).left).toBe(250);
	});

	it("puts the element above the anchor on the top side", () => {
		expect(at(anchorAt(300, 300), { placement: "top-start" })).toEqual({
			left: 300,
			top: 196,
			placement: "top-start",
			side: "top",
			align: "start",
		});
	});

	it("puts the element to the right and aligns it to the top on the right side", () => {
		expect(at(anchorAt(300, 300), { placement: "right-start" })).toEqual({
			left: 404,
			top: 300,
			placement: "right-start",
			side: "right",
			align: "start",
		});
	});

	it("puts the element to the left on the left side", () => {
		expect(at(anchorAt(300, 300), { placement: "left-start" }).left).toBe(96);
	});
});

describe("computePosition: flip", () => {
	// A button at the bottom edge: there is no room below it and there is above — the popup goes up.
	it("flips upwards when it does not fit below", () => {
		const result = at(anchorAt(300, 760));

		expect(result.placement).toBe("top-start");
		expect(result.top).toBe(656); // 760 - 100 - 4
	});

	it("flips downwards when it does not fit above", () => {
		const result = at(anchorAt(300, 10), { placement: "top-start" });

		expect(result.placement).toBe("bottom-start");
		expect(result.top).toBe(34);
	});

	it("flips leftwards when it does not fit to the right", () => {
		const result = at(anchorAt(900, 300), { placement: "right-start" });

		expect(result.placement).toBe("left-start");
		expect(result.left).toBe(696); // 900 - 200 - 4
	});

	// A short screen: it fits neither here nor there. Then we stay on the requested side — there the
	// popup is expected, and the shift will press it to the edge.
	it("stays on the requested side when it fits on neither", () => {
		const result = at(anchorAt(300, 100), { placement: "bottom-start" }, SIZE, { width: 1000, height: 220 });

		expect(result.placement).toBe("bottom-start");
	});

	it("can have the flip switched off", () => {
		const result = at(anchorAt(300, 760), { flip: false });

		expect(result.placement).toBe("bottom-start");
		expect(result.top).toBe(784);
	});
});

describe("computePosition: shift along the side", () => {
	// A button at the right edge: a popup by its left edge would run off the screen.
	it("presses to the right edge without crossing it", () => {
		const result = at(anchorAt(900, 300));

		expect(result.left).toBe(792); // 1000 - 8 - 200
	});

	it("presses to the left edge", () => {
		expect(at(anchorAt(-40, 300)).left).toBe(8);
	});

	it("does not shift what already fits", () => {
		expect(at(anchorAt(300, 300)).left).toBe(300);
	});

	// A popup wider than the screen: it cannot be pressed to both edges, so we show its beginning —
	// a left edge gone negative would hide the first line of the list.
	it("shows its beginning when the element is wider than the screen", () => {
		const result = at(anchorAt(300, 300), {}, { width: 1200, height: 100 });

		expect(result.left).toBe(8);
	});

	it("shifts vertically rather than horizontally on a side placement", () => {
		const result = at(anchorAt(300, 760), { placement: "right-start" });

		expect(result.left).toBe(404); // held to the anchor — nothing moves across
		expect(result.top).toBe(692); // 800 - 8 - 100
	});

	it("can have the shift switched off", () => {
		expect(at(anchorAt(900, 300), { shift: false }).left).toBe(900);
	});

	it("takes a configurable edge padding", () => {
		expect(at(anchorAt(900, 300), { viewportPadding: 24 }).left).toBe(776);
	});
});

describe("computePosition: flip and shift together", () => {
	// A corner of the screen: it fits neither below nor to the right — both have to happen.
	it("flips and presses in the bottom right corner", () => {
		const result = at(anchorAt(940, 770));

		expect(result.placement).toBe("top-start");
		expect(result.top).toBe(666); // 770 - 100 - 4
		expect(result.left).toBe(792); // 1000 - 8 - 200
	});

	// The side is chosen before the shift: a shift along it does not affect whether the popup fits
	// across it, whereas the chosen side decides what to shift along.
	it("does not let the shift undo the side already chosen", () => {
		const result = at(anchorAt(-40, 760));

		expect(result.placement).toBe("top-start");
		expect(result.left).toBe(8);
	});
});

// Pressing across the side is off by default — it would tear the surface away from its anchor —
// and is asked for by whoever belongs to a whole field rather than to a point on it: the editor
// toolbar above the text, which has nowhere to go above the topmost line.
describe("computePosition: clampCross", () => {
	// `flip: false` on purpose: otherwise the flip takes the element to the other side and there is
	// nothing left for the cross-axis press to do. That is the toolbar's own combination.
	it("leaves the element off-screen across the side by default", () => {
		// anchor at the very top: above it there is only 20px, and the element is 100 tall
		expect(at(anchorAt(300, 20), { placement: "top-start", flip: false }).top).toBe(-84);
	});

	it("presses the element into the screen when asked", () => {
		expect(at(anchorAt(300, 20), { placement: "top-start", flip: false, clampCross: true }).top).toBe(8);
	});

	it("presses across the other axis for a side placement", () => {
		expect(at(anchorAt(300, 4), { placement: "right-start", clampCross: true }).top).toBe(8);
	});

	it("does not move the element that already fits", () => {
		expect(at(anchorAt(300, 300), { placement: "top-start", clampCross: true }).top).toBe(196);
	});

	// The two axes stay independent: pressing across must not undo the shift along.
	it("works together with the shift along the side", () => {
		const result = at(anchorAt(940, 20), { placement: "top-start", flip: false, clampCross: true });

		expect(result.top).toBe(8);
		expect(result.left).toBe(792); // 1000 - 8 - 200
	});
});

// A trigger sitting at the right edge of its own block, with a popup wider than the trigger. The
// viewport clamp does not help here: the edge of the screen is far to the right, so the popup is
// held only by its alignment — `bottom-start` lets it hang out past the block, `bottom-end` does not.
describe("computePosition: a trigger at the right edge of a block", () => {
	// button 90 wide, its right edge at 1560 (a 1280 container centred in a 1920 viewport)
	const button = anchorAt(1470, 100, 90, 32);
	const popup = { width: 220, height: 120 };
	const wide = { width: 1920, height: 900 };

	it("hangs the popup out to the right on start alignment", () => {
		const result = at(button, {}, popup, wide);

		expect(result.left).toBe(1470); // nothing clamps — the screen edge is 360px further right
		expect(result.left + popup.width).toBe(1690);
	});

	it("aligns the right edges on end alignment", () => {
		const result = at(button, { placement: "bottom-end" }, popup, wide);

		expect(result.left + popup.width).toBe(1560); // flush with the trigger's right edge
	});

	it("still clamps to the screen when the trigger really is at its edge", () => {
		const result = at(anchorAt(1830, 100, 90, 32), {}, popup, wide);

		expect(result.left).toBe(1692); // 1920 - 8 - 220
	});
});

// The second axis of the flip: that one changes the side, this one the end of the side. Like
// everything else here it answers to the edge of the SCREEN — an element hanging out of its own
// container but still on screen is not overflow as far as this is concerned.
describe("computePosition: flipAlign", () => {
	// A trigger 90 wide whose right edge sits exactly on the edge padding (1000 - 8): `start` runs
	// off the screen from there, `end` is the last alignment that still fits.
	const atEdge = anchorAt(992 - 90, 300, 90, 20);

	it("is off by default, leaving the shift to press the element in", () => {
		const result = at(atEdge, {}, SIZE);

		expect(result.placement).toBe("bottom-start");
		expect(result.left).toBe(792); // 1000 - 8 - 200, pressed in by the shift
	});

	it("swaps start for end when the element runs off the right", () => {
		const result = at(atEdge, { flipAlign: true }, SIZE);

		expect(result.placement).toBe("bottom-end");
		expect(result.left + SIZE.width).toBe(992); // flush with the trigger's right edge
	});

	it("swaps end for start when the element runs off the left", () => {
		const result = at(anchorAt(10, 300, 90, 20), { placement: "bottom-end", flipAlign: true }, SIZE);

		expect(result.placement).toBe("bottom-start");
		expect(result.left).toBe(10);
	});

	it("leaves an alignment that already fits alone", () => {
		const result = at(anchorAt(300, 300), { flipAlign: true }, SIZE);

		expect(result.placement).toBe("bottom-start");
		expect(result.left).toBe(300);
	});

	// Wider than the screen: neither end fits, so the requested one stays and the shift takes over.
	it("keeps the requested alignment when neither end fits", () => {
		const result = at(atEdge, { flipAlign: true }, { width: 1200, height: 100 });

		expect(result.placement).toBe("bottom-start");
		expect(result.left).toBe(8);
	});

	// center has no opposite, so both ends follow it.
	it("falls back from center to an end that fits", () => {
		const result = at(atEdge, { placement: "bottom-center", flipAlign: true }, SIZE);

		expect(result.placement).toBe("bottom-end");
	});

	// The alignment runs along the side, so on a side placement it is the vertical one that swaps.
	it("swaps the vertical alignment on a side placement", () => {
		const result = at(anchorAt(300, 760, 90, 20), { placement: "right-start", flipAlign: true }, SIZE);

		expect(result.placement).toBe("right-end");
		expect(result.top + SIZE.height).toBe(780); // flush with the trigger's bottom edge
	});
});

// Which side to take when the element fits on neither — a long menu on a short screen.
describe("computePosition: fallback", () => {
	// 220 tall viewport, trigger low in it: 100 above the trigger, 80 below. The element needs 100.
	const shortScreen = { width: 1000, height: 220 };
	const trigger = anchorAt(300, 104, 100, 20);

	it("keeps the requested side by default", () => {
		const result = at(trigger, {}, SIZE, shortScreen);

		expect(result.placement).toBe("bottom-start");
	});

	it("takes the side with more room when asked", () => {
		const result = at(trigger, { fallback: "bestFit" }, SIZE, shortScreen);

		expect(result.placement).toBe("top-start");
	});

	// bestFit only decides between two failures: a side that fits still wins outright.
	it("does not override a side that fits", () => {
		const result = at(anchorAt(300, 300), { fallback: "bestFit" }, SIZE);

		expect(result.placement).toBe("bottom-start");
	});

	it("is not consulted when the flip is off", () => {
		const result = at(trigger, { fallback: "bestFit", flip: false }, SIZE, shortScreen);

		expect(result.placement).toBe("bottom-start");
	});
});

// The result names the side and the alignment apart, so that a caller drawing a tooltip tail does
// not have to take the placement string back apart. And the placement itself is always in full
// form — asking for a bare `bottom` gives back `bottom-center`, which is what a bare side means.
describe("computePosition: what the result says about the placement", () => {
	it("gives the side and the alignment apart from the string", () => {
		const result = at(anchorAt(300, 300), { placement: "right-end" });

		expect(result.placement).toBe("right-end");
		expect(result.side).toBe("right");
		expect(result.align).toBe("end");
	});

	it("spells out the alignment a bare side leaves implied", () => {
		const result = at(anchorAt(300, 300), { placement: "bottom" });

		expect(result.placement).toBe("bottom-center");
		expect(result.side).toBe("bottom");
		expect(result.align).toBe("center");
	});

	it("reports the side it flipped to, not the one asked for", () => {
		const result = at(anchorAt(300, 760), { placement: "bottom-start" });

		expect(result.side).toBe("top");
		expect(result.align).toBe("start");
	});
});

// The DOM half, on the one thing jsdom can answer for: which inline properties the module takes
// over and what it gives back. Sizes here are all zero, so the coordinates are not the point —
// whose styles end up on the element is.
describe("clearPosition: the element's own styles", () => {
	const anchor = () => document.getElementById("anchor") as HTMLElement;
	const popup = () => document.getElementById("popup") as HTMLElement;

	const render = (style: string) => {
		document.body.innerHTML = `<button id="anchor"></button><div id="popup" style="${style}"></div>`;
	};

	// The margin used to be saved as the shorthand, and `style.getPropertyValue("margin")` answers
	// with an empty string unless all four sides are set inline. A host that had written one side
	// was therefore recorded as having written nothing, and the restore removed the shorthand —
	// taking that side with it.
	it("gives back a margin the host set on one side only", () => {
		render("margin-left: 17px");

		positionElement(popup(), anchor());
		clearPosition(popup());

		expect(popup().style.marginLeft).toBe("17px");
	});

	it("gives back a margin the host set as the shorthand", () => {
		render("margin: 5px");

		positionElement(popup(), anchor());
		clearPosition(popup());

		expect(popup().style.marginTop).toBe("5px");
		expect(popup().style.marginLeft).toBe("5px");
	});

	it("gives back the coordinates the host set", () => {
		render("right: 5px; bottom: 7px; position: absolute");

		positionElement(popup(), anchor());
		clearPosition(popup());

		expect(popup().style.right).toBe("5px");
		expect(popup().style.bottom).toBe("7px");
		expect(popup().style.position).toBe("absolute");
	});

	// Nothing was taken from this element, so there is nothing to give back — and wiping its
	// coordinates would be taking something instead.
	it("does not touch an element it never took over", () => {
		render("position: absolute; left: 3px; margin-left: 9px");

		clearPosition(popup());

		expect(popup().style.position).toBe("absolute");
		expect(popup().style.left).toBe("3px");
		expect(popup().style.marginLeft).toBe("9px");
	});

	it("does not touch the element a second time either", () => {
		render("margin-left: 9px");

		positionElement(popup(), anchor());
		clearPosition(popup());

		popup().style.left = "40px";
		clearPosition(popup());

		expect(popup().style.left).toBe("40px");
		expect(popup().style.marginLeft).toBe("9px");
	});

	// What the host did not write must not appear out of the restore either.
	it("leaves nothing behind on an element that had no styles of its own", () => {
		render("");

		positionElement(popup(), anchor());
		clearPosition(popup());

		expect(popup().getAttribute("style")).toBeFalsy();
	});
});

// Tracking the size, on a stub: jsdom ships no `ResizeObserver`, so in every other suite this
// branch is simply skipped — and it is the one that can spin. `measure` clears the coordinates
// before reading, so an element whose width depends on where it stands measures wide and is then
// rendered narrow, which wakes the observer again; the guard is that a report equal to the previous
// one is ignored, and the settled size after a frame is always the same. What is checked here is
// that guard, because without it the pair "measure, write" would chase itself through the frames.
describe("trackPosition: the element and the anchor changing size", () => {
	type Report = { target: Element; contentRect: { width: number; height: number } };

	let notify: (entries: Report[]) => void;
	let observed: Element[];
	let disconnected: boolean;

	const original = (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;

	beforeEach(() => {
		observed = [];
		disconnected = false;

		(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
			constructor(callback: (entries: Report[]) => void) {
				notify = callback;
			}
			observe(target: Element) {
				observed.push(target);
			}
			disconnect() {
				disconnected = true;
			}
		};
	});

	afterEach(() => {
		(window as unknown as { ResizeObserver?: unknown }).ResizeObserver = original;
		document.body.innerHTML = "";
	});

	/** Long enough for the scheduled frame to have run. */
	const frame = () => new Promise((resolve) => setTimeout(resolve, 48));

	const scene = () => {
		document.body.innerHTML = `<button id="anchor"></button><div id="popup"></div>`;

		const anchor = document.getElementById("anchor") as HTMLElement;
		const popup = document.getElementById("popup") as HTMLElement;

		// Every recalculation asks the anchor where it is, so counting that counts the passes.
		const rect = jest.fn(() => ({ left: 10, top: 10, width: 100, height: 20 }) as DOMRect);
		anchor.getBoundingClientRect = rect;

		return { anchor, popup, rect };
	};

	it("watches both the element and the anchor", () => {
		const { anchor, popup } = scene();

		const stop = trackPosition(popup, anchor);

		expect(observed).toContain(popup);
		expect(observed).toContain(anchor);

		stop();
		expect(disconnected).toBe(true);
	});

	// `observe` delivers a report straight away, and it says what the size is rather than that it
	// changed — the element was measured and placed a moment before. Acting on it would buy every
	// showing an extra measurement one frame after opening, for nothing.
	it("only remembers the report that arrives with the subscription", async () => {
		const { anchor, popup, rect } = scene();
		const stop = trackPosition(popup, anchor);

		const opened = rect.mock.calls.length;

		notify([
			{ target: popup, contentRect: { width: 200, height: 100 } },
			{ target: anchor, contentRect: { width: 100, height: 20 } },
		]);
		await frame();

		expect(rect.mock.calls.length).toBe(opened);

		stop();
	});

	it("recalculates when the size actually changes", async () => {
		const { anchor, popup, rect } = scene();
		const stop = trackPosition(popup, anchor);

		notify([{ target: popup, contentRect: { width: 200, height: 100 } }]);
		await frame();

		const settled = rect.mock.calls.length;

		notify([{ target: popup, contentRect: { width: 200, height: 260 } }]);
		await frame();

		expect(rect.mock.calls.length).toBeGreaterThan(settled);

		stop();
	});

	// The guard against chasing itself: the same size reported again is the element settling where
	// it was put, not a change worth another pass.
	it("ignores a report that says the size is what it already was", async () => {
		const { anchor, popup, rect } = scene();
		const stop = trackPosition(popup, anchor);

		notify([{ target: popup, contentRect: { width: 200, height: 100 } }]);
		notify([{ target: popup, contentRect: { width: 200, height: 260 } }]);
		await frame();

		const settled = rect.mock.calls.length;

		notify([{ target: popup, contentRect: { width: 200, height: 260 } }]);
		notify([{ target: popup, contentRect: { width: 200, height: 260 } }]);
		await frame();

		expect(rect.mock.calls.length).toBe(settled);

		stop();
	});

	it("tells the element's size from the anchor's", async () => {
		const { anchor, popup, rect } = scene();
		const stop = trackPosition(popup, anchor);

		// Both are seeded, then only the anchor changes: the element must not be taken for it.
		notify([
			{ target: popup, contentRect: { width: 200, height: 100 } },
			{ target: anchor, contentRect: { width: 100, height: 20 } },
		]);
		await frame();

		const settled = rect.mock.calls.length;

		notify([{ target: anchor, contentRect: { width: 100, height: 44 } }]);
		await frame();

		expect(rect.mock.calls.length).toBeGreaterThan(settled);

		stop();
	});
});

// The screen is not the only thing that can cut an element off. A box with `overflow: hidden` is as
// tall as its content, so a menu unfolding below the last thing on a page is cut by the page's own
// bottom edge while the viewport still reports room to spare.
describe("computePosition: a boundary narrower than the screen", () => {
	// The page wrapper: as wide as the screen, but ending well above its bottom.
	const wrapper: Rect = { left: 0, top: 0, width: 1000, height: 500 };

	it("flips over the edge of the boundary, not of the screen", () => {
		const trigger = anchorAt(300, 440);

		expect(at(trigger, {}).side).toBe("bottom");
		expect(at(trigger, { boundary: wrapper }).side).toBe("top");
	});

	it("leaves a placement the boundary still allows", () => {
		const result = at(anchorAt(300, 100), { boundary: wrapper });

		expect(result.side).toBe("bottom");
		expect(result.top).toBe(124);
	});

	it("shifts along the boundary rather than along the screen", () => {
		const narrow: Rect = { left: 100, top: 0, width: 300, height: 800 };
		const result = at(anchorAt(350, 100), { boundary: narrow });

		// 100 + 300 - 8 - 200 — pressed to the boundary's right edge, not to the screen's
		expect(result.left).toBe(192);
	});

	it("keeps the element off the near edge of the boundary too", () => {
		const offset: Rect = { left: 400, top: 0, width: 400, height: 800 };
		const result = at(anchorAt(380, 100), { boundary: offset });

		expect(result.left).toBe(408);
	});

	// Which of two failures is the lesser one is also a question about the boundary.
	it("takes the roomier side of the boundary when asked", () => {
		const short: Rect = { left: 0, top: 0, width: 1000, height: 300 };
		const result = at(anchorAt(300, 200), { boundary: short, fallback: "bestFit" }, { width: 200, height: 400 });

		expect(result.side).toBe("top");
	});
});

// Working the boundary out from the DOM. jsdom lays nothing out, so the geometry of the ancestors
// is given directly; what is being checked is which of them are counted and along which axis.
describe("clippingRect", () => {
	const VIEWPORT = { width: 1000, height: 800 };

	beforeEach(() => {
		Object.defineProperty(document.documentElement, "clientWidth", { value: VIEWPORT.width, configurable: true });
		Object.defineProperty(document.documentElement, "clientHeight", { value: VIEWPORT.height, configurable: true });
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	/**
	 * A wrapper of the given geometry around an element, with whatever overflow is asked for.
	 *
	 * The overflow is written as the two longhands rather than the shorthand: jsdom does not take
	 * `overflow: hidden` apart into the axes, and the axes are what the code reads — and has to
	 * read, since they are allowed to differ.
	 */
	const scene = (overflow: string, box: Rect, position = "absolute") => {
		document.body.innerHTML = `<div id="wrap"><div id="inner"></div></div>`;

		const wrap = document.getElementById("wrap") as HTMLElement;
		const inner = document.getElementById("inner") as HTMLElement;

		if (overflow) wrap.style.cssText = overflow;
		wrap.style.position = "relative";
		inner.style.position = position;

		wrap.getBoundingClientRect = () =>
			({ ...box, right: box.left + box.width, bottom: box.top + box.height }) as DOMRect;
		Object.defineProperty(wrap, "clientWidth", { value: box.width, configurable: true });
		Object.defineProperty(wrap, "clientHeight", { value: box.height, configurable: true });

		return inner;
	};

	const page: Rect = { left: 0, top: 0, width: 1000, height: 500 };

	it("is the whole screen when nothing cuts the element off", () => {
		const inner = scene("overflow-x: visible; overflow-y: visible", page);

		expect(clippingRect(inner)).toEqual({ left: 0, top: 0, ...VIEWPORT });
	});

	it("shrinks to an ancestor that hides its overflow", () => {
		const inner = scene("overflow-x: hidden; overflow-y: hidden", page);

		expect(clippingRect(inner)).toEqual({ left: 0, top: 0, width: 1000, height: 500 });
	});

	// The pair the example's page wrapper uses: cut sideways, let things unfold downwards. Counting
	// such a box as clipping in both directions would take away the very room it was left to give.
	it("counts a box that clips one axis only on that axis", () => {
		const inner = scene("overflow-x: clip; overflow-y: visible", { left: 0, top: 0, width: 600, height: 500 });
		const rect = clippingRect(inner);

		expect(rect.width).toBe(600);
		expect(rect.height).toBe(VIEWPORT.height);
	});

	// A fixed element is laid out against the viewport, so an `overflow: hidden` on the way up
	// never reaches it.
	it("ignores a hiding ancestor for an element the viewport holds", () => {
		const inner = scene("overflow-x: hidden; overflow-y: hidden", page, "fixed");

		expect(clippingRect(inner)).toEqual({ left: 0, top: 0, ...VIEWPORT });
	});

	it("never reports a box larger than the screen", () => {
		const inner = scene("overflow-x: hidden; overflow-y: hidden", {
			left: -200,
			top: -200,
			width: 3000,
			height: 3000,
		});

		expect(clippingRect(inner)).toEqual({ left: 0, top: 0, ...VIEWPORT });
	});
});

// A clipping ancestor scrolls with the page, so where it is changes on every frame while the page
// moves — unlike the answer to which ancestors clip, which comes from the stylesheet. Remembering
// the whole boundary with the size left the element placed against a box that had already moved.
//
// The wrapper here carries a transform as well as the hidden overflow, and it needs both: this
// module lays the element out `position: fixed`, which the viewport holds and an `overflow: hidden`
// on the way up therefore does not reach — until an ancestor makes itself the containing block,
// which is what the transform does.
describe("trackPosition: a boundary that moves with the page", () => {
	const VIEWPORT = { width: 1000, height: 800 };

	beforeEach(() => {
		Object.defineProperty(document.documentElement, "clientWidth", { value: VIEWPORT.width, configurable: true });
		Object.defineProperty(document.documentElement, "clientHeight", { value: VIEWPORT.height, configurable: true });
	});

	afterEach(() => {
		document.body.innerHTML = "";
	});

	// The numbers are chosen so that the boundary alone decides the side: the anchor does not move,
	// the element does not change size, and a scroll of 100 is the whole difference between the
	// element fitting under the anchor and having to turn over.
	it("turns the element over when the ancestor has scrolled the room away", async () => {
		document.body.innerHTML = `<div id="wrap"><button id="anchor"></button><div id="popup"></div></div>`;

		const wrap = document.getElementById("wrap") as HTMLElement;
		const anchor = document.getElementById("anchor") as HTMLElement;
		const popup = document.getElementById("popup") as HTMLElement;

		wrap.style.cssText = "overflow-x: hidden; overflow-y: hidden; transform: translateY(0px)";
		Object.defineProperty(popup, "offsetWidth", { value: 200, configurable: true });
		Object.defineProperty(popup, "offsetHeight", { value: 200, configurable: true });

		let wrapTop = 0;
		wrap.getBoundingClientRect = () => ({ left: 0, top: wrapTop, width: 1000, height: 800 }) as DOMRect;
		Object.defineProperty(wrap, "clientWidth", { value: 1000, configurable: true });
		Object.defineProperty(wrap, "clientHeight", { value: 800, configurable: true });

		anchor.getBoundingClientRect = () =>
			({ left: 0, top: 500, width: 100, height: 20, right: 100, bottom: 520 }) as DOMRect;

		const stop = trackPosition(popup, anchor);

		// under the anchor at 520 + 4, and written in the wrapper's own coordinates, which start at 0
		expect(popup.style.top).toBe("524px");

		// the page scrolls by 100: the wrapper's bottom edge comes up to 700, and 724 no longer fits
		wrapTop = -100;
		window.dispatchEvent(new Event("scroll"));
		await new Promise((resolve) => setTimeout(resolve, 48));

		// above the anchor now: 500 - 200 - 4 = 296, plus the wrapper's own 100
		expect(popup.style.top).toBe("396px");

		stop();
	});
});
