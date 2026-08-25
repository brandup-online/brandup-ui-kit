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

	// В `modifyVars` уходят только переменные: подставить туда правило `@import` или отсоединённый
	// набор правил нечем.
	it("skips at-rules and detached rulesets", () => {
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
