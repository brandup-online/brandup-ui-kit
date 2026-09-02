const fs = require("fs");
const path = require("path");

// Справочник входов кита пишется не рукой: их около полутора сотен, и таблица, набранная отдельно
// от `vars.less`, расходится с ним на первом же переименовании. Здесь она собирается из самого
// файла — имя, умолчание и комментарий рядом с объявлением, — а тест сверяет, что записанный
// в репозиторий TOKENS.md совпадает с тем, что получается сейчас.

const KIT_DIR = path.join(__dirname, "..");
const VARS_FILE = path.join(KIT_DIR, "vars.less");
const SOURCE_DIR = path.join(KIT_DIR, "source");
const OUT_FILE = path.join(KIT_DIR, "TOKENS.md");

// Заголовок раздела в `vars.less`: `// ── Цвет ──`.
const SECTION = /^\s*\/\/\s*─+\s*(.+?)\s*─+\s*$/;
// Рамка крупной части файла набрана символом `═`; её название — на следующей строке.
const BANNER = /^\s*\/\/\s*═+\s*$/;
const BANNER_TITLE = /^\s*\/\/\s*([^─═].*?)\s*$/;
// Объявление с необязательным комментарием в конце строки.
const DECLARATION = /^@([\w-]+):\s*(.+?)\s*;\s*(?:\/\/\s*(.*?)\s*)?$/;
// Объявление CSS-токена в `:root` компонента: `--input-fill: @input-fill;`.
const CSS_TOKEN = /--([\w-]+):\s*@([\w-]+)\s*;/g;

/** Имена less-переменных, которые кит отдаёт наружу CSS-токеном, и имя самого токена. */
function cssTokens() {
	const tokens = new Map();

	for (const name of fs.readdirSync(SOURCE_DIR).filter((file) => file.endsWith(".less"))) {
		const source = fs.readFileSync(path.join(SOURCE_DIR, name), "utf-8");

		for (const [, token, variable] of source.matchAll(CSS_TOKEN)) tokens.set(variable, token);
	}

	return tokens;
}

/**
 * Разбирает `vars.less` на разделы с объявлениями.
 *
 * Многострочное значение (стек шрифтов, тень) здесь не встречается: в файле каждое объявление
 * занимает строку. Встретится — попадёт в отчёт как пропущенное, молча теряться ему нельзя.
 */
function parseVars() {
	const lines = fs.readFileSync(VARS_FILE, "utf-8").split(/\r?\n/);
	const sections = [];
	const skipped = [];

	let part = null;
	let section = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (BANNER.test(line)) {
			const title = lines[i + 1]?.match(BANNER_TITLE);
			// Рамка закрывающая — её вторая строка уже не название, а объявление или пустота.
			if (title && !DECLARATION.test(lines[i + 1].trim())) {
				part = title[1].replace(/\s*[—.]\s*.*$/, "");
				section = null;
			}
			continue;
		}

		const heading = line.match(SECTION);
		if (heading) {
			section = { part, title: heading[1], rows: [] };
			sections.push(section);
			continue;
		}

		// Комментарий-подзаголовок вида `// popup` — тоже раздел, только набранный проще.
		const simple = line.match(/^\/\/\s*([a-z][\w -]*)$/);
		if (simple) {
			section = { part, title: simple[1], rows: [] };
			sections.push(section);
			continue;
		}

		const declaration = line.match(DECLARATION);
		if (!declaration) {
			if (/^@[\w-]+\s*:/.test(line)) skipped.push(line.trim());
			continue;
		}

		if (!section) {
			section = { part, title: null, rows: [] };
			sections.push(section);
		}

		const [, name, value, comment] = declaration;
		section.rows.push({ name, value, comment: comment ?? "" });
	}

	return { sections: sections.filter((one) => one.rows.length), skipped };
}

/** Значение в ячейке таблицы: `|` внутри значения разорвал бы строку таблицы. */
const cell = (text) => text.replace(/\|/g, "\\|");

function render() {
	const { sections, skipped } = parseVars();
	if (skipped.length) throw new Error(`Не разобраны объявления vars.less:\n${skipped.join("\n")}`);

	const tokens = cssTokens();
	const lines = [
		"# Входы темы @brandup/ui-kit",
		"",
		"Файл собран из [vars.less](vars.less) — править нужно его, а не эту таблицу:",
		"`npm run docs:tokens` в пакете. Тест `tokens-doc` держит их вместе.",
		"",
		"Колонка «CSS» — имя, под которым значение уезжает в `:root` и доступно в браузере:",
		"его можно переопределить на живой странице или на поддереве. Прочерк — значение",
		"существует только на сборке (границы адаптива, доли для арифметики).",
		"",
	];

	let part = null;

	for (const section of sections) {
		if (section.part !== part) {
			part = section.part;
			if (part) lines.push(`## ${part}`, "");
		}

		if (section.title) lines.push(`### ${section.title}`, "");

		lines.push("| Переменная | Умолчание | CSS | Что задаёт |", "| --- | --- | --- | --- |");

		for (const row of section.rows) {
			const token = tokens.get(row.name);

			// Пустых ячеек в таблице нет: `|  |` — две подряд идущие рамки с пробелом между
			// ними, на что markdownlint отвечает MD060. Отсутствие значения пишется прочерком,
			// как и в колонке CSS.
			lines.push(
				`| \`@${row.name}\` | \`${cell(row.value)}\` | ${token ? `\`--${token}\`` : "—"} | ${cell(row.comment) || "—"} |`
			);
		}

		lines.push("");
	}

	return lines.join("\n").replace(/\n+$/, "\n");
}

function build() {
	fs.writeFileSync(OUT_FILE, render(), "utf-8");

	return OUT_FILE;
}

module.exports = { render, build, OUT_FILE };

if (require.main === module) console.log("written", build());
