import ru from "../src/frontend/locale/ru.json";
import en from "../src/frontend/locale/en.json";

// Ключ, забытый в одном из словарей, не ломает ни сборку, ни типы: движок отдаст вместо текста
// сам путь до ключа, и заметить это можно только глазами на странице.
const paths = (model: unknown, prefix = ""): string[] =>
	typeof model === "object" && model !== null
		? Object.entries(model).flatMap(([key, value]) => paths(value, prefix ? `${prefix}.${key}` : key))
		: [prefix];

it("словари обоих языков объявляют одни и те же ключи", () => {
	expect(paths(en).sort()).toEqual(paths(ru).sort());
});

it("ни одна строка не осталась пустой", () => {
	const empty = (model: unknown, prefix = ""): string[] =>
		typeof model === "object" && model !== null
			? Object.entries(model).flatMap(([key, value]) => empty(value, prefix ? `${prefix}.${key}` : key))
			: typeof model === "string" && model.trim()
				? []
				: [prefix];

	expect(empty(ru)).toEqual([]);
	expect(empty(en)).toEqual([]);
});
