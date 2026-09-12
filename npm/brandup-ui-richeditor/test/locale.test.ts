/**
 * @jest-environment jsdom
 */
import { resetTexts, setTexts } from "@brandup/ui-kit/i18n";
import { BLOCK_TYPES, EDITOR_ACTIONS, FORMAT_TOOLS } from "../source/format-config";
import { EMOJI_GROUPS } from "../source/emoji";
import { RICHEDITOR } from "../source/names";
import ru from "../locale/ru.json";

afterEach(() => resetTexts());

// A dictionary is not an object literal, so a stale key in it would pass the type check of
// setTexts unnoticed and simply never be read. Order is not part of it: the keys are compared
// as sets, so moving one in the file is not a failure.
it("the dictionary carries exactly the declared captions", () => {
	expect(Object.keys(ru)).toEqual(["richeditor"]);
	expect(Object.keys(ru.richeditor).sort()).toEqual(Object.keys(RICHEDITOR.TEXT).sort());
});

it("the defaults are english", () => {
	expect(BLOCK_TYPES.quote.title).toBe("Quote");
	expect(FORMAT_TOOLS.bold.title).toBe("Bold");
	expect(EDITOR_ACTIONS.undo.title).toBe("Undo (Ctrl+Z)");
	expect(EMOJI_GROUPS[0].title).toBe("Smileys and gestures");
});

// The captions live in module constants built when the package loads, which is before an
// application gets to register its own: each one has to be read, not copied, at that moment.
it("the application texts reach the configuration records", () => {
	setTexts(ru);

	expect(BLOCK_TYPES.quote.title).toBe("Цитата");
	expect(FORMAT_TOOLS.bold.title).toBe("Жирный");
	expect(EDITOR_ACTIONS.undo.title).toBe("Отменить (Ctrl+Z)");
	expect(EMOJI_GROUPS[0].title).toBe("Смайлы и жесты");
});

it("a spread of a configuration record carries the current caption", () => {
	setTexts(ru);

	expect({ ...FORMAT_TOOLS.link }.title).toBe("Ссылка");
});
