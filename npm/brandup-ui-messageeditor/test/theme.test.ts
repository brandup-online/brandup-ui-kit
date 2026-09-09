/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";

// Плашка сообщения жила с застывшей светлой заливкой, а цвет текста в ней брала у темы. На тёмной
// теме это давало светлый текст по светлому фону — прочитать плашку было нельзя. Здесь заперты оба
// правила, которыми это чинилось; проверяются они по тексту входов, потому что вся суть в том,
// от чего значение зависит, а не в том, во что оно разрешится.

const VARS = fs.readFileSync(path.join(__dirname, "..", "vars.less"), "utf-8");

/** Объявления входов: имя и значение, без комментариев и пустых строк. */
const declarations = (): Array<[name: string, value: string]> =>
	VARS.split("\n")
		.map((line) => line.replace(/\/\/.*$/, "").trim())
		.map((line) => line.match(/^@([\w-]+)\s*:\s*(.+);$/))
		.filter((match): match is RegExpMatchArray => !!match)
		.map((match) => [match[1], match[2]]);

const valueOf = (name: string): string => {
	const found = declarations().find(([token]) => token === name);
	if (!found) throw new Error(`Вход "@${name}" не объявлен`);

	return found[1];
};

describe("плашка сообщения следует теме", () => {
	// Заливка обязана зависеть от фона страницы: цвет текста в плашке берётся у темы, и застывшая
	// заливка разошлась бы с ним на первой же тёмной теме.
	it("выводит заливку из фона страницы, а не задаёт готовым цветом", () => {
		expect(valueOf("messageeditor-fill")).toContain("var(--surface");
	});

	// На белом фоне значение обязано остаться прежним: тёмная тема чинится не ценой светлой.
	it("даёт на белом фоне ровно прежний #e7f3ff", () => {
		const mix = valueOf("messageeditor-fill").match(
			/color-mix\(in srgb, var\(--surface[^)]*\) (\d+)%, (#[0-9a-f]{6})\)/i
		);
		expect(mix).not.toBeNull();

		const share = Number(mix![1]) / 100;
		const tint = mix![2];
		const channel = (at: number) =>
			Math.round(255 * share + parseInt(tint.slice(1 + at * 2, 3 + at * 2), 16) * (1 - share));

		expect(`#${[0, 1, 2].map((at) => channel(at).toString(16).padStart(2, "0")).join("")}`).toBe("#e7f3ff");
	});

	// Приём «притемнить, чтобы отличалось» работает только на светлом: на тёмной теме он делает
	// и без того тёмное ещё темнее, и рамка в фокусе, подложка цитаты и подсветка под курсором
	// пропадают. Двигаться нужно к цвету текста — противоположному фону концу шкалы.
	it("нигде не притемняет к постоянному чёрному", () => {
		const darkened = declarations().filter(([, value]) => /color-mix\([^;]*#000\b/.test(value));

		expect(darkened.map(([name]) => name)).toEqual([]);
	});

	it("во всех смешениях уводит цвет к цвету текста темы", () => {
		const mixes = declarations().filter(([, value]) => value.includes("color-mix("));

		expect(mixes.length).toBeGreaterThan(4);
		for (const [name, value] of mixes)
			if (name !== "messageeditor-fill") expect([name, value.includes("var(--text-color")]).toEqual([name, true]);
	});
});
