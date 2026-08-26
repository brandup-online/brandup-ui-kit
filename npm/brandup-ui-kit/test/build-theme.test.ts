import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import buildTheme from "../build/build-theme.cjs";

const { extractRootBlocks } = buildTheme;

// Сборщик темы достаёт из скомпилированного CSS только объявления токенов и складывает их
// в отдельный файл. Проверяем разбор и склейку вариантов; сама компиляция less здесь подменена —
// её поведение не наше, а вот что мы ей передаём и что берём обратно, наше целиком.

let directory: string;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "uikit-theme-"));
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

const write = (name: string, source: string): string => {
	const file = path.join(directory, name);
	fs.writeFileSync(file, source, "utf-8");
	return file;
};

/** Подменяет less: вместо компиляции отдаёт CSS, собранный из полученных значений. */
const lessStub = (emit: (vars: Record<string, string>) => string) => ({
	render: async (_source: string, options: { modifyVars: Record<string, string> }) => ({
		css: emit(options.modifyVars),
	}),
});

describe("extractRootBlocks", () => {
	it("takes the declarations of a :root block", () => {
		expect(extractRootBlocks(":root {\n  --a: 1px;\n  --b: red;\n}")).toEqual(["--a: 1px;\n  --b: red;"]);
	});

	// Между правилами в собранном CSS стоит не только `}`: комментарий из исходника пакета доезжает
	// до выхода, и поиск блока по одному лишь `}` терял всё, что за ним, — так пропадал целый блок
	// токенов полей ввода.
	it("finds a block that follows a css comment", () => {
		const css = ":root {\n  --a: 1px;\n}\n/* про поля ввода */\n:root {\n  --b: 2px;\n}";

		expect(extractRootBlocks(css)).toEqual(["--a: 1px;", "--b: 2px;"]);
	});

	it("ignores :root with a qualifier and :root inside a selector", () => {
		const css = ':root[data-theme="dark"] {\n  --a: 1px;\n}\n.x:root {\n  --b: 2px;\n}';

		expect(extractRootBlocks(css)).toEqual([]);
	});
});

describe("buildTheme", () => {
	it("puts the theme's tokens under :root", async () => {
		const theme = write("uikit.vars.less", "@accent: #096252;");
		const entry = write("styles.less", "/* не компилируется, less подменён */");

		const css = await buildTheme({
			theme,
			entries: [entry],
			less: lessStub((vars) => `:root { --accent: ${vars["@accent"]}; }`),
		});

		expect(css).toBe(":root {\n\t--accent: #096252;\n}\n");
	});

	// Вариант — дельта поверх основной темы, а не отдельная тема: тёмная меняет цвета, а кегль
	// и пропорции берёт у основной. Иначе всё, чего в её файле нет, откатывалось бы к умолчаниям.
	it("builds a variant on top of the base theme and keeps only what differs", async () => {
		const theme = write("uikit.vars.less", "@accent: #096252;\n@font-size: 16px;");
		const dark = write("dark.vars.less", "@accent: #65b0a1;");
		const entry = write("styles.less", "/* … */");

		const css = await buildTheme({
			theme,
			entries: [entry],
			variants: [{ selector: ':root[data-theme="dark"]', theme: dark }],
			less: lessStub((vars) => `:root { --accent: ${vars["@accent"]}; --font-size: ${vars["@font-size"]}; }`),
		});

		expect(css).toContain("--accent: #096252;");
		expect(css).toContain('\n:root[data-theme="dark"] {\n\t--accent: #65b0a1;\n}');
		// Кегль вариант унаследовал, а раз он совпал с основным — в дельту не попал.
		expect(css.split('[data-theme="dark"]')[1]).not.toContain("--font-size");
	});

	it("writes the result when asked for a file", async () => {
		const theme = write("uikit.vars.less", "@accent: #096252;");
		const entry = write("styles.less", "/* … */");
		const out = path.join(directory, "dist", "theme.css");

		await buildTheme({ theme, entries: [entry], out, less: lessStub(() => ":root { --accent: #096252; }") });

		expect(fs.readFileSync(out, "utf-8")).toContain("--accent: #096252;");
	});

	it("refuses to build without a theme", async () => {
		await expect(buildTheme({} as never)).rejects.toThrow("theme");
	});

	// Точка с запятой встречается и в значении — `url("data:image/svg+xml;base64,…")`. Наивное
	// деление тела правила по ней обрезало токен и оставляло в файле незакрытую строку.
	it("keeps a value that contains a semicolon", async () => {
		const theme = write("uikit.vars.less", "@x: 1px;");
		const entry = write("styles.less", "/* … */");
		const icon = 'url("data:image/svg+xml;base64,AAA=")';

		const css = await buildTheme({
			theme,
			entries: [entry],
			less: lessStub(() => `:root { --icon: ${icon}; --after: 2px; }`),
		});

		expect(css).toContain(`--icon: ${icon};`);
		expect(css).toContain("--after: 2px;");
	});
});
