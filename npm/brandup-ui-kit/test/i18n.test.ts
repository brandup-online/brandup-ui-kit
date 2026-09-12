import { declareTexts, resetTexts, setTexts } from "../source/i18n";
import { UIKIT } from "../source/names";
import ru from "../locale/ru.json";

declare module "../source/i18n" {
	interface KitTexts {
		test: { HELLO: string; BYE: string };
		other: { HELLO: string };
	}
}

const TEXT = declareTexts("test", { HELLO: "Hello", BYE: "Bye" });
const OTHER = declareTexts("other", { HELLO: "Hello" });

afterEach(() => resetTexts());

describe("declareTexts", () => {
	it("returns the defaults while nothing is registered", () => {
		expect(TEXT.HELLO).toBe("Hello");
		expect(TEXT.BYE).toBe("Bye");
	});

	it("keeps the keys enumerable", () => {
		expect(Object.keys(TEXT)).toEqual(["HELLO", "BYE"]);
		expect({ ...TEXT }).toEqual({ HELLO: "Hello", BYE: "Bye" });
	});

	it("does not let a caption be assigned over", () => {
		expect(() => {
			(<{ HELLO: string }>TEXT).HELLO = "Changed";
		}).toThrow();
		expect(TEXT.HELLO).toBe("Hello");
	});
});

describe("setTexts", () => {
	it("replaces a caption", () => {
		setTexts({ test: { HELLO: "Привет" } });

		expect(TEXT.HELLO).toBe("Привет");
	});

	it("leaves the captions it does not mention", () => {
		setTexts({ test: { HELLO: "Привет" } });

		expect(TEXT.BYE).toBe("Bye");
	});

	it("touches only its own namespace", () => {
		setTexts({ test: { HELLO: "Привет" } });

		expect(OTHER.HELLO).toBe("Hello");
	});

	it("merges over what was registered before", () => {
		setTexts({ test: { HELLO: "Привет" } });
		setTexts({ test: { BYE: "Пока" } });

		expect(TEXT.HELLO).toBe("Привет");
		expect(TEXT.BYE).toBe("Пока");
	});

	it("skips a caption given as undefined", () => {
		setTexts({ test: { HELLO: "Привет" } });
		setTexts({ test: { HELLO: undefined } });

		expect(TEXT.HELLO).toBe("Привет");
	});

	// An application registers its texts at startup, while the package declaring the namespace may
	// be imported much later: a control of a page loaded on demand.
	it("applies to a namespace declared after the call", () => {
		setTexts({ test: { HELLO: "Привет" } });

		const late = declareTexts("test", { HELLO: "Hello", BYE: "Bye" });
		expect(late.HELLO).toBe("Привет");
	});
});

// Such a name is not declared in `KitTexts` on purpose: `toString` there would make
// `KitTextOverrides` itself unusable, since every object literal carries an inherited `toString`
// that would have to match the namespace. So only the runtime is checked, through the untyped
// door — an application still reaches it, a dictionary being a json file whose keys are its own.
describe("a namespace whose name belongs to Object.prototype", () => {
	const declareAny = <(ns: string, defaults: Record<string, string>) => Record<string, string>>(
		(<unknown>declareTexts)
	);
	const setAny = <(texts: Record<string, Record<string, string>>) => void>(<unknown>setTexts);

	it("takes the application texts like any other", () => {
		const inherited = declareAny("toString", { HELLO: "Hello" });

		setAny({ toString: { HELLO: "Привет" } });

		expect(inherited.HELLO).toBe("Привет");
		expect(TEXT.HELLO).toBe("Hello");
	});

	// On a map with a prototype the captions of such a namespace would be written onto the
	// inherited member itself — every object of the page shares it.
	it("writes nothing onto the inherited member", () => {
		setAny({ toString: { HELLO: "Привет" } });

		expect(Object.hasOwn(Object.prototype.toString, "HELLO")).toBe(false);
	});

	// `JSON.parse` gives `__proto__` as an ordinary key, and a dictionary is a json file.
	it("stores a namespace named __proto__ without touching the prototype", () => {
		setAny(JSON.parse('{"__proto__":{"HELLO":"Привет"}}'));

		expect((<Record<string, unknown>>{}).HELLO).toBeUndefined();
		expect(TEXT.HELLO).toBe("Hello");
	});
});

describe("resetTexts", () => {
	it("drops one namespace", () => {
		setTexts({ test: { HELLO: "Привет" }, other: { HELLO: "Привет" } });

		resetTexts("test");

		expect(TEXT.HELLO).toBe("Hello");
		expect(OTHER.HELLO).toBe("Привет");
	});

	it("drops all namespaces", () => {
		setTexts({ test: { HELLO: "Привет" }, other: { HELLO: "Привет" } });

		resetTexts();

		expect(TEXT.HELLO).toBe("Hello");
		expect(OTHER.HELLO).toBe("Hello");
	});
});

describe("locale/ru.json", () => {
	// A dictionary is not an object literal, so a stale key in it would pass the type check of
	// setTexts unnoticed and simply never be read. Order is not part of it: the keys are compared
	// as sets, so moving one in the file is not a failure.
	it("carries exactly the declared captions", () => {
		expect(Object.keys(ru)).toEqual(["modal"]);
		expect(Object.keys(ru.modal).sort()).toEqual(Object.keys(UIKIT.MODAL.TEXT).sort());
	});

	it("reaches the control captions", () => {
		setTexts(ru);

		expect(UIKIT.MODAL.TEXT.CLOSE).toBe("Закрыть");
	});
});
