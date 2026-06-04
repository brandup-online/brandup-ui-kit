/**
 * @jest-environment jsdom
 */
import {
	toggleFormat,
	isFormatActive,
	serialize,
	deserialize,
	defaultFormatMarkers,
	normalizeWhitespace,
} from "../npm/brandup-ui-textbox/source/format";

function makeRoot(html: string): HTMLElement {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	root.contentEditable = "true";
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const range = document.createRange();
	range.setStart(startNode, startOffset);
	range.setEnd(endNode, endOffset);
	sel.addRange(range);
	return sel;
}

function toggle(root: HTMLElement, tool: "bold" | "italic" | "strike" | "underline") {
	const sel = window.getSelection()!;
	toggleFormat(root, sel.getRangeAt(0), tool, sel);
}

describe("toggleFormat", () => {
	it("wraps a selected word in the canonical tag", () => {
		const root = makeRoot("foo bar baz");
		const text = root.firstChild!;
		select(text, 4, text, 7);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("foo <b>bar</b> baz");
		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("removes formatting when the whole selection is already formatted", () => {
		const root = makeRoot("foo <b>bar</b> baz");
		const bold = root.querySelector("b")!;
		const text = bold.firstChild!;
		select(text, 0, text, 3);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("foo bar baz");
	});

	it("splits the formatting element on a partial unwrap", () => {
		const root = makeRoot("<b>foobar</b>");
		const text = root.querySelector("b")!.firstChild!;
		select(text, 3, text, 6);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<b>foo</b>bar");
	});

	it("formats the whole mixed selection (adds where missing) and merges adjacent tags", () => {
		const root = makeRoot("foo<b>bar</b>");
		const foo = root.firstChild!;
		const bar = root.querySelector("b")!.firstChild!;
		select(foo, 0, bar, 3);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<b>foobar</b>");
	});

	it("removes only the targeted format, keeping other formatting intact", () => {
		const root = makeRoot("<b><i>x</i></b>");
		const text = root.querySelector("i")!.firstChild!;
		select(text, 0, text, 1);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<i>x</i>");
	});

	it("is a no-op for a collapsed selection", () => {
		const root = makeRoot("foo");
		const text = root.firstChild!;
		select(text, 1, text, 1);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("foo");
	});

	it("toggling twice returns to the original markup", () => {
		const root = makeRoot("foo bar baz");
		const text = root.firstChild!;
		select(text, 4, text, 7);

		toggle(root, "italic");
		expect(root.innerHTML).toBe("foo <i>bar</i> baz");

		const italicText = root.querySelector("i")!.firstChild!;
		select(italicText, 0, italicText, 3);
		toggle(root, "italic");

		expect(root.innerHTML).toBe("foo bar baz");
	});
});

describe("custom markdown markers", () => {
	it("serializes with overridden markers", () => {
		const markers = defaultFormatMarkers();
		markers.italic = "_";

		const root = makeRoot("<i>x</i> y");
		expect(serialize(root, "markdown", ["italic"], markers)).toBe("_x_ y");
	});

	it("deserializes overridden markers back to tags", () => {
		const markers = defaultFormatMarkers();
		markers.italic = "_";

		expect(deserialize("_x_ y", "markdown", ["italic"], markers)).toBe("<i>x</i> y");
	});

	it("applies longer markers before shorter prefixes (bold __ vs italic _)", () => {
		const markers = defaultFormatMarkers();
		markers.bold = "__";
		markers.italic = "_";

		expect(deserialize("__x__", "markdown", ["bold", "italic"], markers)).toBe("<b>x</b>");
	});
});

describe("normalizeWhitespace", () => {
	it("collapses repeated spaces and trims the edges", () => {
		const root = makeRoot("  a   b  ");
		normalizeWhitespace(root);
		expect(root.textContent).toBe("a b");
	});

	it("normalizes whitespace across inline formatting tags", () => {
		const root = makeRoot("<b>a  </b>  b");
		normalizeWhitespace(root);
		expect(root.textContent).toBe("a b");
		expect(root.querySelector("b")).not.toBeNull();
	});

	it("trims each line independently and keeps the line break", () => {
		const root = makeRoot("a  b <br>  c   d ");
		normalizeWhitespace(root);
		expect(root.innerHTML).toBe("a b<br>c d");
	});

	it("drops a tag that becomes empty after trimming", () => {
		const root = makeRoot("<b>  </b>x");
		normalizeWhitespace(root);
		expect(root.querySelector("b")).toBeNull();
		expect(root.textContent).toBe("x");
	});
});

describe("isFormatActive", () => {
	it("reports active when the selection is fully formatted", () => {
		const root = makeRoot("<b>bar</b>");
		const text = root.querySelector("b")!.firstChild!;
		const sel = select(text, 0, text, 3);

		expect(isFormatActive(root, sel.getRangeAt(0), "bold")).toBe(true);
		expect(isFormatActive(root, sel.getRangeAt(0), "italic")).toBe(false);
	});

	it("reports inactive when only part of the selection is formatted", () => {
		const root = makeRoot("foo<b>bar</b>");
		const foo = root.firstChild!;
		const bar = root.querySelector("b")!.firstChild!;
		const sel = select(foo, 0, bar, 3);

		expect(isFormatActive(root, sel.getRangeAt(0), "bold")).toBe(false);
	});
});
