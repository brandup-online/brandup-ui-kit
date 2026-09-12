import { resetTexts, setTexts } from "@brandup/ui-kit/i18n";
import { TEXTBOX } from "../source/names";
import ru from "../locale/ru.json";

afterEach(() => resetTexts());

// A dictionary is not an object literal, so a stale key in it would pass the type check of
// setTexts unnoticed and simply never be read. Order is not part of it: the keys are compared
// as sets, so moving one in the file is not a failure.
it("the dictionary carries exactly the declared captions", () => {
	expect(Object.keys(ru)).toEqual(["textbox"]);
	expect(Object.keys(ru.textbox).sort()).toEqual(Object.keys(TEXTBOX.TEXT).sort());
});

it("the defaults are english", () => {
	expect(TEXTBOX.TEXT.COPY).toBe("Copy to clipboard");
});

it("the application texts replace them", () => {
	setTexts(ru);

	expect(TEXTBOX.TEXT.COPY).toBe("Скопировать в буфер обмена");
});
