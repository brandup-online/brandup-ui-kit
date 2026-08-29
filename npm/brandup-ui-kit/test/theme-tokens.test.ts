/**
 * @jest-environment node
 */

// less сам выбирает, чем читать файлы, и в jsdom берёт браузерный менеджер — тот про диск
// ничего не знает и отвечает «файл не найден» на первый же `@import`. Этому набору DOM не нужен
// вовсе: он читает текст собранного CSS.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import buildTheme from "../build/build-theme.cjs";

const { extractRootBlocks } = buildTheme;

// Входы компонентов выведены из палитры ссылкой на её CSS-токен, а не вычисленным значением
// (см. шапку второй части vars.less). Разница не видна в собранном файле на глаз, зато мгновенно
// теряется при правке: стоит написать `@input-fill: @surface` вместо `@input-fill: var(--surface)`,
// и less снова запечёт литерал — собранный CSS останется валидным, тесты вида «файл собрался»
// пройдут, а тёмная тема, оформление под клиента и предпросмотр тихо перестанут работать.
//
// Поэтому проверяем не значения, а саму связь: производный токен обязан ссылаться, а не повторять.

const KIT = path.join(__dirname, "..");

/**
 * Собирает тему кита на его же умолчаниях и отдаёт объявления токенов.
 *
 * Через `buildTheme`, а не своей компиляцией less: это ровно тот путь, которым тема доезжает
 * до проекта, и проверять связь стоит на том, что уедет в `theme.css`, а не на похожем.
 * Файл темы нужен ему обязательно — даём пустой, тогда в дело идут умолчания из `vars.less`.
 */
async function renderTokens(): Promise<Map<string, string>> {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "uikit-tokens-"));
	const theme = path.join(directory, "uikit.vars.less");
	fs.writeFileSync(theme, "", "utf-8");

	try {
		const css = await buildTheme({ theme, paths: [KIT] });
		const tokens = new Map<string, string>();

		// Только блоки `:root` — теми же глазами, что смотрит сам сборщик. Токен, объявленный
		// внутри правила, темой не является: `.ui-button` переопределяет себе
		// `--svg-fill: currentColor`, и собранный без разбора список выдал бы за тему его.
		for (const block of extractRootBlocks(css))
			for (const [, token, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g))
				tokens.set(token, value.trim());

		return tokens;
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

let tokens: Map<string, string>;

beforeAll(async () => {
	tokens = await renderTokens();
}, 30000);

describe("component inputs follow the palette", () => {
	// Пара «производный токен → токен, из которого он выведен». Список не полон намеренно:
	// здесь те связи, на которых держатся перекраска сайта и тёмная тема, — цвет, размер поля
	// и всё, что кнопка берёт у поля ввода.
	const derived: Array<[string, string]> = [
		["--main-background", "--surface"],
		["--text-color", "--ink"],
		["--input-fill", "--surface"],
		["--input-color", "--text-color"],
		["--input-border-color", "--line"],
		["--input-border-width", "--border-width"],
		["--input-border-radius", "--radius"],
		["--input-height", "--control-height"],
		["--input-padding-lr", "--control-padding-lr"],
		["--hover--input-border-color", "--line-hover"],
		["--focus--input-border-color", "--accent"],
		["--checkbox-fill-checked", "--accent"],
		["--checkbox-mark", "--accent-contrast"],
		["--radio-dot", "--accent-contrast"],
		["--button-fill", "--input-fill"],
		["--button-color", "--text-color"],
		["--button-height", "--input-height"],
		["--button-radius", "--input-border-radius"],
		["--button-accent", "--focus--input-border-color"],
		["--button-accent-color", "--accent-contrast"],
		["--danger--button-accent", "--danger"],
		["--focus-ring-color", "--accent"],
		["--popup-fill", "--main-background"],
		["--popup-border-color", "--line"],
		["--popup-border-radius", "--radius-overlay"],
		["--svg-fill", "--text-color"],
	];

	it.each(derived)("%s refers to %s", (token, source) => {
		expect(tokens.get(token)).toBe(`var(${source})`);
	});

	// Палитра — сырьё, и ссылаться ей не на что: значение здесь и объявляется. Ссылка в ней
	// означала бы круг — токен, выведенный сам из себя.
	it.each([
		"--surface",
		"--ink",
		"--line",
		"--accent",
		"--accent-contrast",
		"--danger",
		"--space",
		"--radius",
		"--border-width",
		"--control-height",
	])("%s is a literal, not a reference", (token) => {
		expect(tokens.get(token)).not.toMatch(/^var\(/);
	});

	// Тот самый случай, ради которого связь и заводилась: тёмная тема — это переопределение
	// палитры, а не перечисление сотни входов.
	it("a palette override reaches every derived token", () => {
		const palette = new Set([
			"--surface",
			"--ink",
			"--line",
			"--line-hover",
			"--accent",
			"--accent-contrast",
			"--danger",
		]);

		// Считаем, на скольких токенах палитра держится: если однажды их станет заметно меньше,
		// значит связь где-то оборвали.
		const following = [...tokens.values()].filter((value) =>
			[...palette].some((name) => value.includes(`var(${name})`))
		);

		expect(following.length).toBeGreaterThanOrEqual(15);
	});
});
