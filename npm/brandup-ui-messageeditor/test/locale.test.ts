/**
 * @jest-environment jsdom
 */
import { resetTexts, setTexts } from "@brandup/ui-kit/i18n";
import { MESSAGEEDITOR } from "../source/names";
import RandomizerModal from "../source/randomizer";
import ru from "../locale/ru.json";

const opened: Array<{ close(): void }> = [];
const open = <T extends { close(): void }>(modal: T): T => {
	opened.push(modal);
	return modal;
};

beforeEach(() => {
	document.body.innerHTML = "";
	document.body.className = "";
});

afterEach(() => {
	opened.forEach((modal) => modal.close());
	opened.length = 0;
	resetTexts();
});

const title = (modal: RandomizerModal) =>
	modal.element!.querySelector<HTMLElement>(`.${MESSAGEEDITOR.CLASS.MODAL.ELEMENT.APPLY}`)?.textContent;

// A dictionary is not an object literal, so a stale key in it would pass the type check of
// setTexts unnoticed and simply never be read. Order is not part of it: the keys are compared
// as sets, so moving one in the file is not a failure.
it("the dictionary carries exactly the declared captions", () => {
	expect(Object.keys(ru)).toEqual(["messageeditor"]);
	expect(Object.keys(ru.messageeditor).sort()).toEqual(Object.keys(MESSAGEEDITOR.TEXT).sort());
});

it("the defaults are english", () => {
	expect(title(open(new RandomizerModal("text", () => {})))).toBe("Save");
});

it("the application texts reach the markup", () => {
	setTexts(ru);

	expect(title(open(new RandomizerModal("текст", () => {})))).toBe("Сохранить");
});

// The mode buttons used to be a module constant, which froze their captions at package load,
// before an application could register its own.
it("the mode captions are read when the markup is built", () => {
	setTexts({ messageeditor: { MODE_TEXT: "Сообщение" } });

	expect(MESSAGEEDITOR.TEXT.MODE_TEXT).toBe("Сообщение");
	expect(MESSAGEEDITOR.TEXT.MODE_SOURCE).toBe("Markdown");
});
