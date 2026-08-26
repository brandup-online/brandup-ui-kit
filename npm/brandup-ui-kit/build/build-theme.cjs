const fs = require("fs");
const path = require("path");
const parseLessVars = require("./parse-less-vars.cjs");

// Тема отдельным файлом.
//
// Обычная сборка запекает значения темы прямо в бандл: `modifyVars` подставляется в момент
// компиляции, и сменить тему нельзя иначе как пересобрав всё. Отсюда нет ни тёмной темы, ни
// оформления под клиента, ни предпросмотра.
//
// Здесь из тех же исходников кита достаётся только то, что тема и задаёт, — блоки `:root`, —
// и складывается в отдельный `theme.css`. Он подключается после бандла и перекрывает его
// умолчания, поэтому проект без него продолжает работать как раньше, а с ним получает вторую
// тему одним файлом и без пересборки.
//
// Чего это не даёт: значения в файле остаются вычисленными. Переопределить в браузере одну
// `--accent` и ждать, что за ней поедут все производные, нельзя — производные считает less,
// когда собирает этот файл, а не браузер.

const KIT_SOURCE = path.join(__dirname, "..", "source");

// Умолчание — те файлы кита, что объявляют токены. Попап и модальное окно идут отдельно от
// styles.less: их стили подключает не общий бандл, а сам компонент.
const DEFAULT_ENTRIES = ["styles.less", "popup.less", "modal.less"].map((name) => path.join(KIT_SOURCE, name));

/**
 * Достаёт из скомпилированного CSS содержимое всех блоков `:root`, сохраняя порядок.
 *
 * Правило считается своим, только если `:root` открывает селектор. Проверяем это по предыдущему
 * непробельному символу, а не по одному лишь `}`: между правилами стоит и CSS-комментарий
 * (`/* … *\/` из исходника пакета доезжает до выхода), и на нём поиск по `}` терял блок целиком —
 * так пропадали все токены полей ввода.
 */
function extractRootBlocks(css) {
	const declarations = [];
	const OPENS_SELECTOR = /[}/;]/;

	let from = 0;
	for (;;) {
		const at = css.indexOf(":root", from);
		if (at === -1) break;

		from = at + 5;

		let before = at - 1;
		while (before >= 0 && /\s/.test(css[before])) before--;
		if (before >= 0 && !OPENS_SELECTOR.test(css[before])) continue;

		let brace = from;
		while (brace < css.length && /\s/.test(css[brace])) brace++;
		if (css[brace] !== "{") continue; // `:root[data-theme]` и подобное — не наш блок

		const start = brace + 1;

		let depth = 1;
		let end = start;
		while (end < css.length && depth > 0) {
			if (css[end] === "{") depth++;
			else if (css[end] === "}") depth--;
			if (depth > 0) end++;
		}

		declarations.push(css.slice(start, end).trim());
		from = end;
	}

	return declarations;
}

/**
 * Режет тело правила на объявления. Точка с запятой внутри скобок и кавычек концом объявления
 * не считается: в значении она встречается — `url("data:image/svg+xml;base64,…")`, — и наивное
 * деление обрезало бы такой токен по ней, теряя остаток и оставляя в файле незакрытую строку.
 */
function splitDeclarations(body) {
	const declarations = [];
	let current = "";
	let depth = 0;
	let quote = null;

	for (let i = 0; i < body.length; i++) {
		const char = body[i];

		if (quote) {
			current += char;
			if (char === "\\") current += body[++i] ?? "";
			else if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'") quote = char;
		else if (char === "(") depth++;
		else if (char === ")") depth--;
		else if (char === ";" && depth <= 0) {
			declarations.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	declarations.push(current);

	return declarations;
}

/**
 * Собирает один вариант темы: компилирует входные файлы с его значениями и оставляет от них
 * только объявления токенов.
 *
 * `inherited` — значения основной темы. Вариант ложится поверх них, а не вместо: тёмная тема
 * меняет цвета, а шрифт, кегль и пропорции берёт у основной. Иначе всё, чего нет в файле
 * варианта, откатывалось бы к умолчаниям кита — и вариант пришлось бы писать целиком.
 */
async function renderVariant(less, entries, modifyVars, extraPaths) {
	const seen = new Map();

	for (const entry of entries) {
		const packageDirectory = path.dirname(path.dirname(entry));

		const rendered = await less.render(fs.readFileSync(entry, "utf-8"), {
			filename: entry,
			// node_modules пакета — потому что стили компонента импортируют соседей по имени
			// (`@import "@brandup/ui-input/source/input.less"`). В обычной сборке их находит
			// webpack, здесь less идёт сам, и без этого пути такой файл во вход не годится.
			paths: [
				path.dirname(entry),
				packageDirectory,
				path.join(packageDirectory, "node_modules"),
				KIT_SOURCE,
				...extraPaths,
			],
			math: "always",
			modifyVars,
		});

		for (const block of extractRootBlocks(rendered.css)) {
			for (const declaration of splitDeclarations(block)) {
				const parsed = declaration.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/);
				// Токен, объявленный дважды, оставляем в последней редакции — так же его прочитал
				// бы и браузер, и так же его видит бандл.
				if (parsed) seen.set(parsed[1], parsed[2].trim());
			}
		}
	}

	return seen;
}

/**
 * Собирает `theme.css` из файла темы.
 *
 * @param {object} options
 * @param {string} options.theme путь к файлу темы (`uikit.vars.less`)
 * @param {string[]} [options.entries] less-файлы, чьи блоки `:root` образуют тему
 * @param {Array<{selector: string, theme: string}>} [options.variants] дополнительные варианты —
 *   тёмная тема, оформление под клиента; каждый попадает под свой селектор
 * @param {string[]} [options.paths] дополнительные каталоги для поиска импортов
 * @param {string} [options.out] куда записать результат; без него CSS только возвращается
 * @param {object} [options.less] экземпляр less (по умолчанию берётся из зависимостей кита)
 * @returns {Promise<string>} собранный CSS
 */
async function buildTheme(options) {
	const { theme, entries = DEFAULT_ENTRIES, variants = [], paths = [], out } = options;
	if (!theme) throw new Error('buildTheme: не задан "theme" — путь к файлу темы.');

	const less = options.less ?? require("less");

	const parts = [];

	// Файл темы разбираем один раз: разбор ещё и проверяет имена, а повторять эти жалобы
	// столько раз, сколько собирается вариантов, значит приучить их не читать.
	const baseVars = parseLessVars(theme);
	const base = await renderVariant(less, entries, baseVars, paths);
	parts.push(formatBlock(":root", base));

	for (const variant of variants) {
		const values = await renderVariant(less, entries, { ...baseVars, ...parseLessVars(variant.theme) }, paths);

		// В вариант пишем только то, что отличается от основной темы: иначе тёмная тема была бы
		// копией светлой целиком, и разницу между ними пришлось бы искать глазами.
		const changed = new Map([...values].filter(([token, value]) => base.get(token) !== value));

		if (changed.size) parts.push(formatBlock(variant.selector, changed));
	}

	const css = `${parts.join("\n\n")}\n`;

	if (out) {
		fs.mkdirSync(path.dirname(out), { recursive: true });
		fs.writeFileSync(out, css, "utf-8");
	}

	return css;
}

function formatBlock(selector, values) {
	const body = [...values].map(([token, value]) => `\t${token}: ${value};`).join("\n");

	return `${selector} {\n${body}\n}`;
}

module.exports = buildTheme;
module.exports.extractRootBlocks = extractRootBlocks;
module.exports.DEFAULT_ENTRIES = DEFAULT_ENTRIES;
