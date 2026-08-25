const fs = require("fs");

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
 * Читает файл темы и отдаёт переменные в виде, который ждёт `modifyVars` less-loader'а.
 *
 * Повторное объявление перекрывает предыдущее — так же, как это делает сам less.
 */
function parseLessVars(filePath) {
	filePath = filePath ?? "uikit.vars.less";
	if (!fs.existsSync(filePath)) throw new Error(`Not found UI kit configuration file "${filePath}".`);

	const source = stripComments(fs.readFileSync(filePath, "utf-8"));

	const variables = {};

	for (const statement of topLevelStatements(source)) {
		const match = statement.match(DECLARATION);
		if (!match) continue;

		// Отсоединённый набор правил (`@name: { … }`) переменной темы не является: подставлять его
		// в `modifyVars` нечем, и в файле темы ему делать нечего.
		const value = match[2].replace(/\s+/g, " ").trim();
		if (value.startsWith("{")) continue;

		variables[`@${match[1]}`] = value;
	}

	return variables;
}

module.exports = parseLessVars;
