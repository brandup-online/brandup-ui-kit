import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import parseLessVars from "../build/parse-less-vars.cjs";

// Разбор файла темы — единственное место, через которое проект настраивает кит под себя, и ошибка
// здесь не видна ни в сборке, ни в браузере: тема просто оказывается не той, что написана в файле.
// Поэтому каждый случай ниже — то, что уже разбиралось неверно.

let directory: string;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "uikit-vars-"));
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

const parse = (source: string): Record<string, string> => {
	const file = path.join(directory, "uikit.vars.less");
	fs.writeFileSync(file, source, "utf-8");
	return parseLessVars(file);
};

describe("parseLessVars", () => {
	it("reads plain declarations", () => {
		expect(parse("@font-size: 14px;\n@text-color: #222;")).toEqual({
			"@font-size": "14px",
			"@text-color": "#222",
		});
	});

	// Закомментировать переменную — обычный способ временно вернуть умолчание кита. Пока комментарии
	// разбирались наравне с кодом, такая строка не выключалась, а перекрывала рабочую, если стояла
	// ниже неё: откат молча включал откаченное значение.
	it("ignores commented out declarations", () => {
		expect(parse("@border-radius: 5px;\n// @border-radius: 999px;")).toEqual({ "@border-radius": "5px" });
		expect(parse("@border-radius: 5px;\n/* @border-radius: 999px; */")).toEqual({ "@border-radius": "5px" });
	});

	// Хвостовой комментарий в файлах темы — норма (в vars.less кита ими объяснено почти каждое
	// значение), и он не должен попадать в само значение. Точка с запятой внутри такого
	// комментария — то, на чём это ломалось: значение забиралось до последней в строке.
	it("keeps a trailing comment out of the value", () => {
		expect(parse("@input-height: 46px; // было @input-height: 80px;")).toEqual({ "@input-height": "46px" });
	});

	// Тень и стек шрифтов естественно переносятся на несколько строк. Такое объявление пропадало
	// целиком и без предупреждения — тема откатывалась на умолчание кита.
	it("reads a value spanning several lines", () => {
		const source = "@popup-box-shadow:\n\t0 1px 2px rgba(0, 0, 0, 0.1),\n\t0 4px 8px rgba(0, 0, 0, 0.1);";

		expect(parse(source)).toEqual({
			"@popup-box-shadow": "0 1px 2px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.1)",
		});
	});

	// `//` в адресе — не комментарий. Отличаем по символу перед слешами: у комментария это пробел
	// или конец предыдущего объявления, у адреса — буква или открывающая скобка.
	it("keeps urls intact", () => {
		expect(parse("@a: url(https://cdn.test/a.png);\n@b: url(//cdn.test/b.png);")).toEqual({
			"@a": "url(https://cdn.test/a.png)",
			"@b": "url(//cdn.test/b.png)",
		});
	});

	// В `modifyVars` уходят только переменные: подставить туда само правило `@import` или
	// отсоединённый набор правил нечем.
	it("skips at-rules and detached rulesets", () => {
		fs.writeFileSync(path.join(directory, "other.less"), "", "utf-8");

		expect(parse('@import (reference) "other.less";\n@ruleset: { color: red; };\n@font-size: 14px;')).toEqual({
			"@font-size": "14px",
		});
	});

	// Так же, как сам less: побеждает последнее объявление.
	it("lets a later declaration win", () => {
		expect(parse("@font-size: 14px;\n@font-size: 16px;")).toEqual({ "@font-size": "16px" });
	});

	// Без файла темы кит собрался бы с умолчаниями и разница увиделась бы только в браузере,
	// поэтому это ошибка сборки — и в ней должен стоять путь, который искали.
	it("fails on a missing file naming the path", () => {
		const missing = path.join(directory, "absent.vars.less");

		expect(() => parseLessVars(missing)).toThrow(missing);
	});
});

// Имя мимо списка входов кита less молча объявит неиспользуемой переменной: сборка пройдёт,
// значение останется умолчанием, и разница увидится только в браузере — если вообще увидится.
describe("parseLessVars name check", () => {
	let warn: jest.SpyInstance;

	beforeEach(() => {
		warn = jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	const warnings = (): string => warn.mock.calls.map((call) => String(call[0])).join("\n");

	// Чужая конвенция именования — самая частая ошибка здесь: у трёх проектов из четырёх свои
	// переменные названы `@Primary-Color`, и рука пишет так же во входе кита.
	it("warns about a name that differs only in case or dashes", () => {
		parse("@fontSize: 14px;");

		expect(warnings()).toContain('"@fontSize"');
		expect(warnings()).toContain('"@font-size"');
	});

	it("warns about a one-character typo", () => {
		parse("@font-siz: 14px;");

		expect(warnings()).toContain('"@font-size"');
	});

	it("says nothing about a name the kit knows", () => {
		parse("@font-size: 14px;\n@input-height: 46px;");

		expect(warn).not.toHaveBeenCalled();
	});

	// Тема законно объявляет и собственные переменные — палитру, из которой выводит значения.
	// Ругаться на них было бы шумом, за которым перестанут читать и настоящие находки.
	it("says nothing about the theme's own palette", () => {
		parse("@accent-dark: #096252;\n@neutral-light: #f6f7f8;\n@text-color: @accent-dark;");

		expect(warn).not.toHaveBeenCalled();
	});
});

// Без разворачивания импортов тема обязана лежать одним плоским файлом: вынести палитру отдельно
// было нельзя, а `@import` молча не давал ничего.
describe("parseLessVars @import", () => {
	const write = (name: string, source: string): string => {
		const file = path.join(directory, name);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, source, "utf-8");
		return file;
	};

	it("takes variables from an imported file", () => {
		write("palette.less", "@accent: #096252;");
		const theme = write("uikit.vars.less", '@import "palette.less";\n@input-border-color: @accent;');

		expect(parseLessVars(theme)).toEqual({ "@accent": "#096252", "@input-border-color": "@accent" });
	});

	it("understands import options and a missing extension", () => {
		write("palette.less", "@accent: #096252;");
		const theme = write("uikit.vars.less", '@import (reference) "palette";');

		expect(parseLessVars(theme)).toEqual({ "@accent": "#096252" });
	});

	// Порядок тот же, что у less: побеждает объявление, стоящее позже по развёрнутому тексту.
	it("lets the importing file override what it imported", () => {
		write("palette.less", "@accent: #096252;");
		const theme = write("uikit.vars.less", '@accent: #000;\n@import "palette.less";\n@font-size: 14px;');

		expect(parseLessVars(theme)["@accent"]).toBe("#096252");

		const after = write("after.vars.less", '@import "palette.less";\n@accent: #fff;');

		expect(parseLessVars(after)["@accent"]).toBe("#fff");
	});

	it("resolves an address that points into a package", () => {
		write("node_modules/fake-kit/package.json", '{ "name": "fake-kit", "version": "1.0.0" }');
		write("node_modules/fake-kit/palette.less", "@accent: #096252;");
		const theme = write("uikit.vars.less", '@import (reference) "fake-kit/palette.less";');

		expect(parseLessVars(theme)).toEqual({ "@accent": "#096252" });
	});

	// Один и тот же файл читается один раз — как `@import (once)` у less. Заодно это защита
	// от кольца: без неё разбор ушёл бы в бесконечную рекурсию.
	it("reads a file once and survives a cycle", () => {
		write("a.less", '@import "b.less";\n@a: 1px;');
		write("b.less", '@import "a.less";\n@b: 2px;');
		const theme = write("uikit.vars.less", '@import "a.less";');

		expect(parseLessVars(theme)).toEqual({ "@a": "1px", "@b": "2px" });
	});

	// Правилом импорта считается `@import`, за которым идёт пробел, скобка или кавычка. Иначе
	// им становится и переменная, чьё имя с этого слова начинается: она молча пропадала бы
	// из темы, да ещё и с жалобой на непрочитанный импорт.
	it("does not mistake a variable named like an import for one", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		const theme = write("uikit.vars.less", "@import-prefix: 5px;\n@importance: bold;");

		expect(parseLessVars(theme)).toEqual({ "@import-prefix": "5px", "@importance": "bold" });
		expect(warn).not.toHaveBeenCalled();

		warn.mockRestore();
	});

	// Адрес может вести в пакет, чьи `exports` его наружу не отдают, — такие файлы приносят
	// миксины, а не значения, и ронять из-за них сборку незачем. Но и молчать нельзя.
	it("warns instead of failing when an import cannot be read", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		const theme = write("uikit.vars.less", '@import "nowhere/palette.less";\n@font-size: 14px;');

		expect(parseLessVars(theme)).toEqual({ "@font-size": "14px" });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("nowhere/palette.less"));

		warn.mockRestore();
	});
});
