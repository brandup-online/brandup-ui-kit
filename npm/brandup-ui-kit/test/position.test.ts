/**
 * @jest-environment jsdom
 */
import { computePosition, type PositionOptions, type Rect } from "../source/position";

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

		expect(result).toEqual({ left: 300, top: 324, placement: "bottom-start" });
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
		});
	});

	it("puts the element to the right and aligns it to the top on the right side", () => {
		expect(at(anchorAt(300, 300), { placement: "right-start" })).toEqual({
			left: 404,
			top: 300,
			placement: "right-start",
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
