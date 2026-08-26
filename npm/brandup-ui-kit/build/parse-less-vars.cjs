const fs = require("fs");
const path = require("path");

// Файл темы разбирается текстом, а не less-ом: значения нужны синхронно, в момент сборки конфига
// webpack (`modifyVars: parseLessVars()`), а компиляция less асинхронная. Поэтому разбор идёт
// сканером по символам — построчной регулярки тут мало, см. причины ниже.

// Комментарий отличаем от протокола в адресе по символу перед `//`: в `https://` и `url(//cdn…)`
// слеши стоят вплотную к предыдущему символу, а комментарий всегда открывается после пробела,
// перевода строки или конца предыдущего объявления.
const COMMENT_LEAD = /[\s;{},]/;

// Объявление переменной ищем от начала инструкции, а не где попало в строке: иначе `@x: 1px`
// внутри комментария или чужого текста тоже считается объявлением.
const DECLARATION = /^\s*@([\w-]+)\s*:\s*([\s\S]+)$/;

// `@import`, у которого могут быть скобочные опции (`(reference)`, `(once)`) и обёртка `url()`.
//
// За словом обязан идти пробел, скобка или кавычка, а не просто граница слова: иначе правилом
// импорта считается и переменная с таким началом в имени (`@import-prefix: 5px`) — она молча
// пропадала бы из темы, да ещё и с жалобой на непрочитанный импорт.
const IMPORT = /^\s*@import(?=[\s("'])\s*(?:\([^)]*\))?\s*([\s\S]+)$/;

/**
 * Вырезает комментарии обоих видов. Без этого закомментированное объявление разбирается наравне
 * с рабочим и, если стоит ниже, перебивает его — «закомментировал, чтобы откатить» молча включало
 * бы откаченное значение.
 */
function stripComments(source) {
	let result = "";
	let quote = null;

	for (let i = 0; i < source.length; i++) {
		const char = source[i];

		if (quote) {
			result += char;
			if (char === "\\") result += source[++i] ?? "";
			else if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			result += char;
			continue;
		}

		if (char === "/" && source[i + 1] === "/" && (i === 0 || COMMENT_LEAD.test(source[i - 1]))) {
			while (i < source.length && source[i] !== "\n") i++;
			result += "\n"; // перевод строки сохраняем: он разделяет соседние объявления
			continue;
		}

		if (char === "/" && source[i + 1] === "*") {
			const end = source.indexOf("*/", i + 2);
			i = end === -1 ? source.length : end + 1;
			result += " ";
			continue;
		}

		result += char;
	}

	return result;
}

/**
 * Режет исходник на инструкции верхнего уровня. Точка с запятой внутри скобок и блоков не считается
 * концом инструкции — иначе многострочное значение (тень, стек шрифтов) разваливается на куски
 * и молча пропадает, а тема откатывается на умолчание кита без единого предупреждения.
 */
function topLevelStatements(source) {
	const statements = [];
	let current = "";
	let depth = 0;
	let quote = null;

	for (let i = 0; i < source.length; i++) {
		const char = source[i];

		if (quote) {
			current += char;
			if (char === "\\") current += source[++i] ?? "";
			else if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'") quote = char;
		else if (char === "{" || char === "(") depth++;
		else if (char === "}" || char === ")") depth--;
		else if (char === ";" && depth <= 0) {
			statements.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	statements.push(current);

	return statements;
}

/**
 * Достаёт адрес из инструкции `@import`. Возвращает `null`, если инструкция импортом не является.
 */
function importTarget(statement) {
	const match = statement.match(IMPORT);
	if (!match) return null;

	let target = match[1].trim();

	const url = target.match(/^url\(\s*([\s\S]*?)\s*\)$/);
	if (url) target = url[1].trim();

	const quoted = target.match(/^(['"])([\s\S]*)\1/);
	// Без кавычек за адресом может стоять медиавыражение (`@import "a.less" screen`) — берём
	// только первое слово.
	target = quoted ? quoted[2] : target.split(/\s+/)[0];

	return target;
}

/**
 * Ищет импортируемый файл: сначала рядом с импортирующим, затем среди пакетов. Второе нужно для
 * адресов вида `@brandup/ui-kit/source/adaptive.less` — их отдаёт `exports` пакета.
 */
function resolveImport(target, fromFile) {
	if (/^(https?:)?\/\//.test(target)) return null; // сетевой адрес не читаем
	if (target.endsWith(".css")) return null; // css less оставляет ссылкой, а не встраивает

	const directory = path.dirname(fromFile);
	const candidates = target.endsWith(".less") ? [target] : [target, `${target}.less`];

	for (const candidate of candidates) {
		const resolved = path.resolve(directory, candidate);
		if (fs.existsSync(resolved)) return resolved;
	}

	if (!target.startsWith(".")) {
		for (const candidate of candidates) {
			try {
				return require.resolve(candidate, { paths: [directory] });
			} catch {
				// пробуем следующий вариант
			}
		}
	}

	return null;
}

/**
 * Читает файл и складывает его переменные в `variables`, разворачивая `@import` на месте.
 *
 * Повторно один и тот же файл не читается: у less импорт по умолчанию `once`, и без этого
 * ромбовидный импорт (двое ссылаются на одну палитру) уводил бы разбор в круг.
 */
function collectVariables(filePath, variables, visited) {
	const resolved = path.resolve(filePath);
	if (visited.has(resolved)) return;
	visited.add(resolved);

	const source = stripComments(fs.readFileSync(resolved, "utf-8"));

	for (const statement of topLevelStatements(source)) {
		const target = importTarget(statement);

		if (target !== null) {
			const imported = target && resolveImport(target, resolved);

			// Не найденный импорт не роняем: адрес может вести в пакет, чьи `exports` его наружу
			// не отдают, а такие файлы приносят миксины, а не значения темы. Но и молчать нельзя —
			// ровно так теряется вынесенная в отдельный файл палитра.
			if (imported) collectVariables(imported, variables, visited);
			else
				console.warn(
					`[ui-kit] Не удалось прочитать @import "${target}" из "${resolved}" — его переменные в тему не попадут.`
				);

			continue;
		}

		const match = statement.match(DECLARATION);
		if (!match) continue;

		// Отсоединённый набор правил (`@name: { … }`) переменной темы не является: подставлять его
		// в `modifyVars` нечем, и в файле темы ему делать нечего.
		const value = match[2].replace(/\s+/g, " ").trim();
		if (value.startsWith("{")) continue;

		variables[`@${match[1]}`] = value;
	}
}

// Список входов кита — то, что объявлено в его собственном vars.less. Больше `modifyVars`
// ни на что не влияет: имя мимо этого списка less молча объявит неиспользуемой переменной,
// сборка пройдёт, а значение останется умолчанием кита.
const KIT_VARS = path.join(__dirname, "..", "vars.less");

let kitInputs = null;

// Сравниваем имена без регистра и дефисов: почти все опечатки здесь — это `@fontSize` вместо
// `@font-size`, то есть чужая конвенция именования, а не промах по клавише.
const normalizeName = (name) => name.toLowerCase().replace(/-/g, "");

function knownInputs() {
	if (kitInputs) return kitInputs;

	kitInputs = new Map();

	try {
		const source = stripComments(fs.readFileSync(KIT_VARS, "utf-8"));

		for (const statement of topLevelStatements(source)) {
			const match = statement.match(DECLARATION);
			if (match) kitInputs.set(normalizeName(match[1]), `@${match[1]}`);
		}
	} catch {
		// Кит распакован без vars.less — сверять не с чем, проверку пропускаем.
	}

	return kitInputs;
}

/** Расстояние Левенштейна, ограниченное сверху: дальше единицы ответ нас уже не интересует. */
function editDistance(a, b) {
	if (Math.abs(a.length - b.length) > 1) return 2;

	let row = Array.from({ length: b.length + 1 }, (_, i) => i);

	for (let i = 1; i <= a.length; i++) {
		const next = [i];

		for (let j = 1; j <= b.length; j++) {
			next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}

		row = next;
	}

	return row[b.length];
}

/**
 * Предупреждает о переменной темы, похожей на вход кита, но им не являющейся.
 *
 * Молчим обо всём остальном: тема законно объявляет и собственные переменные — палитру, из которой
 * потом выводит значения, — и ругаться на них было бы шумом.
 */
function reportUnknownNames(variables) {
	const known = knownInputs();
	if (!known.size) return;

	for (const name of Object.keys(variables)) {
		const normalized = normalizeName(name.slice(1));

		let suggestion = known.get(normalized);

		if (!suggestion) {
			for (const [candidate, original] of known) {
				if (editDistance(normalized, candidate) <= 1) {
					suggestion = original;
					break;
				}
			}
		}

		if (suggestion && suggestion !== name)
			console.warn(
				`[ui-kit] Переменная темы "${name}" киту неизвестна и ни на что не влияет. Возможно, имелась в виду "${suggestion}".`
			);
	}
}

/**
 * Читает файл темы и отдаёт переменные в виде, который ждёт `modifyVars` less-loader'а.
 *
 * Повторное объявление перекрывает предыдущее — так же, как это делает сам less.
 */
function parseLessVars(filePath) {
	filePath = filePath ?? "uikit.vars.less";
	if (!fs.existsSync(filePath)) throw new Error(`Not found UI kit configuration file "${filePath}".`);

	const variables = {};
	collectVariables(filePath, variables, new Set());
	reportUnknownNames(variables);

	return variables;
}

module.exports = parseLessVars;
