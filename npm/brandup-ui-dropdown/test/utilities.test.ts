import { detectLanguage, transcriptText } from "../source/utils/utilities";

describe("detectLanguage", () => {
	it("identifies english text by first letter", () => {
		expect(detectLanguage("hello")).toBe("english");
	});

	it("identifies russian text by first letter", () => {
		expect(detectLanguage("привет")).toBe("russian");
	});

	it("returns null for empty string", () => {
		expect(detectLanguage("")).toBeNull();
	});

	it("returns null for text without letters", () => {
		expect(detectLanguage("123 !!!")).toBeNull();
	});

	it("uses first letter, ignoring leading non-letters", () => {
		expect(detectLanguage("123hello")).toBe("english");
		expect(detectLanguage(" — привет")).toBe("russian");
	});

	it("uses the language of the first letter when text is mixed", () => {
		expect(detectLanguage("hello мир")).toBe("english");
		expect(detectLanguage("мир hello")).toBe("russian");
	});

	it("is case-insensitive", () => {
		expect(detectLanguage("HELLO")).toBe("english");
		expect(detectLanguage("ПРИВЕТ")).toBe("russian");
	});
});

describe("transcriptText", () => {
	it("returns russian-layout equivalent for english text", () => {
		// 'orange' on Russian keyboard: o→щ, r→к, a→ф, n→т, g→п, e→у
		expect(transcriptText("orange")).toEqual({ russian: "щкфтпу" });
	});

	it("returns english-layout equivalent for russian text", () => {
		// 'привет' on English keyboard: п→g, р→h, и→b, в→d, е→t, т→n
		expect(transcriptText("привет")).toEqual({ english: "ghbdtn" });
	});

	it("returns empty object for empty input", () => {
		expect(transcriptText("")).toEqual({});
	});

	it("returns empty object when text contains no letters", () => {
		expect(transcriptText("12345")).toEqual({});
	});

	it("preserves characters not in the layout dictionary", () => {
		// 'a'→'ф', 'b'→'и', '1' stays '1' (not in dict)
		expect(transcriptText("ab1")).toEqual({ russian: "фи1" });
	});

	it("lowercases input before transliteration", () => {
		// 'ABC' → 'abc' → 'фис'
		expect(transcriptText("ABC")).toEqual({ russian: "фис" });
	});
});
