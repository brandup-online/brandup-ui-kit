/**
 * @jest-environment jsdom
 */
import {
	toggleFormat,
	isFormatActive,
	serialize,
	deserialize,
	defaultFormatMarkers,
	normalizeWhitespace,
	normalizeParagraphs,
	type FormatTool,
} from "../source/format";
import { innerSelection, mapCharOffset } from "../source/selection";
import { ensureParagraphs, paragraphsNormalized } from "../source/paragraphs";

function makeRoot(html: string): HTMLElement {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	root.contentEditable = "true";
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
	const sel = window.getSelection()!;
	sel.removeAllRanges();
	const range = document.createRange();
	range.setStart(startNode, startOffset);
	range.setEnd(endNode, endOffset);
	sel.addRange(range);
	return sel;
}

function toggle(root: HTMLElement, tool: "bold" | "italic" | "strike" | "underline") {
	const sel = window.getSelection()!;
	toggleFormat(root, sel.getRangeAt(0), tool, sel);
}

describe("toggleFormat", () => {
	it("wraps a selected word in the canonical tag", () => {
		const root = makeRoot("foo bar baz");
		const text = root.firstChild!;
		select(text, 4, text, 7);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("foo <b>bar</b> baz");
		expect(window.getSelection()!.toString()).toBe("bar");
	});

	it("removes formatting when the whole selection is already formatted", () => {
		const root = makeRoot("foo <b>bar</b> baz");
		const bold = root.querySelector("b")!;
		const text = bold.firstChild!;
		select(text, 0, text, 3);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("foo bar baz");
	});

	it("splits the formatting element on a partial unwrap", () => {
		const root = makeRoot("<b>foobar</b>");
		const text = root.querySelector("b")!.firstChild!;
		select(text, 3, text, 6);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<b>foo</b>bar");
	});

	it("formats the whole mixed selection (adds where missing) and merges adjacent tags", () => {
		const root = makeRoot("foo<b>bar</b>");
		const foo = root.firstChild!;
		const bar = root.querySelector("b")!.firstChild!;
		select(foo, 0, bar, 3);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<b>foobar</b>");
	});

	it("removes only the targeted format, keeping other formatting intact", () => {
		const root = makeRoot("<b><i>x</i></b>");
		const text = root.querySelector("i")!.firstChild!;
		select(text, 0, text, 1);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<i>x</i>");
	});

	it("is a no-op for a collapsed selection", () => {
		const root = makeRoot("foo");
		const text = root.firstChild!;
		select(text, 1, text, 1);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("foo");
	});

	it("toggling twice returns to the original markup", () => {
		const root = makeRoot("foo bar baz");
		const text = root.firstChild!;
		select(text, 4, text, 7);

		toggle(root, "italic");
		expect(root.innerHTML).toBe("foo <i>bar</i> baz");

		const italicText = root.querySelector("i")!.firstChild!;
		select(italicText, 0, italicText, 3);
		toggle(root, "italic");

		expect(root.innerHTML).toBe("foo bar baz");
	});
});

describe("custom markdown markers", () => {
	it("serializes with overridden markers", () => {
		const markers = defaultFormatMarkers();
		markers.italic = "_";

		const root = makeRoot("<i>x</i> y");
		expect(serialize(root, "markdown", ["italic"], markers)).toBe("_x_ y");
	});

	it("deserializes overridden markers back to tags", () => {
		const markers = defaultFormatMarkers();
		markers.italic = "_";

		expect(deserialize("_x_ y", "markdown", ["italic"], markers)).toBe("<i>x</i> y");
	});

	it("applies longer markers before shorter prefixes (bold __ vs italic _)", () => {
		const markers = defaultFormatMarkers();
		markers.bold = "__";
		markers.italic = "_";

		expect(deserialize("__x__", "markdown", ["bold", "italic"], markers)).toBe("<b>x</b>");
	});
});

// Разметка распознаётся по правилам мессенджеров: маркер на границе слова, содержимое без
// пробелов по краям и в пределах одной строки. Иначе редактор показывал бы форматирование
// там, где получатель увидит обычный текст.
describe("markdown boundaries", () => {
	const md = defaultFormatMarkers();
	const parse = (text: string) => deserialize(text, "markdown", ["bold", "italic"], md);

	it("ignores markers glued to word characters", () => {
		expect(parse("5**4 = 20, 3**2 = 6")).toBe("5**4 = 20, 3**2 = 6");
		expect(parse("файл_имя_файла.txt")).toBe("файл_имя_файла.txt");
	});

	it("ignores markers with whitespace next to the content", () => {
		expect(parse("2 ** 2 ** 2")).toBe("2 ** 2 ** 2");
		expect(parse("_  внутри  _")).toBe("_  внутри  _");
		expect(parse("маска _.txt и _.log")).toBe("маска _.txt и _.log");
	});

	// `_` курсива — префикс `__` подчёркивания и принадлежит другой инструкции, поэтому
	// длинный маркер не забирает третий символ и внешняя пара остаётся курсиву
	it("leaves a shorter prefix marker room to pair around the longer one", () => {
		expect(deserialize("___текст___", "markdown", ["underline", "italic"], md)).toBe("<i><u>текст</u></i>");
		expect(deserialize("__текст__", "markdown", ["underline", "italic"], md)).toBe("<u>текст</u>");
		expect(deserialize("_текст_", "markdown", ["underline", "italic"], md)).toBe("<i>текст</i>");
	});

	// в keycap-последовательности маркер — базовый символ эмодзи, а не разметка
	it("does not treat a keycap base character as a marker", () => {
		const starMarkers = defaultFormatMarkers();
		starMarkers.bold = "*";

		expect(deserialize("*⃣раз*", "markdown", ["bold"], starMarkers)).toBe("*⃣раз*");
		expect(deserialize("*слово*", "markdown", ["bold"], starMarkers)).toBe("<b>слово</b>");
	});

	it("does not let a format cross a line break", () => {
		expect(parse("через _две\nстроки_ нельзя")).toBe("через _две<br>строки_ нельзя");
	});

	// маркер вокруг пробела не сработает ни у нас, ни у мессенджера — получатель увидел бы
	// сами маркеры, поэтому краевые пробелы выносятся за них при сериализации
	it("moves edge whitespace out of the markers", () => {
		expect(serialize(makeRoot("<b> слово </b>дальше"), "markdown", ["bold"], md)).toBe("**слово** дальше");
		expect(serialize(makeRoot("а<b>б </b>в"), "markdown", ["bold"], md)).toBe("а**б** в");
		expect(serialize(makeRoot("а<b> </b>в"), "markdown", ["bold"], md)).toBe("а в");
	});

	// пересекающиеся пары дали бы `<b>a <i>b</b> c</i>` — браузер перестроил бы такой HTML
	// по-своему, и форматирование протекло бы за пределы разметки
	// длинный маркер применяется первым, поэтому пересечение всегда отбрасывает короткий
	it("leaves crossing marker pairs as plain text", () => {
		expect(parse("**a _b** c_")).toBe("<b>a _b</b> c_");
		expect(parse("_a **b_ c**")).toBe("_a <b>b_ c</b>");
	});

	it("still allows properly nested pairs", () => {
		expect(parse("_a **b** c_")).toBe("<i>a <b>b</b> c</i>");
		expect(parse("**весь _текст_ жирный**")).toBe("<b>весь <i>текст</i> жирный</b>");
	});

	it("accepts markers at word boundaries and next to punctuation", () => {
		expect(parse("цена _от_ 100")).toBe("цена <i>от</i> 100");
		expect(parse("_начало_ строки")).toBe("<i>начало</i> строки");
		expect(parse("конец _строки_")).toBe("конец <i>строки</i>");
		expect(parse("(_в скобках_), _с запятой_.")).toBe("(<i>в скобках</i>), <i>с запятой</i>.");
		expect(parse("**жирный** и _курсив_")).toBe("<b>жирный</b> и <i>курсив</i>");
	});
});

describe("paragraphs (multiline)", () => {
	const md = defaultFormatMarkers();

	it("serializes <p> as paragraphs and <br> as soft breaks (HTML)", () => {
		const root = makeRoot("<p>a<br>b</p><p>c</p>");
		expect(serialize(root, "html", [], md, true)).toBe("<p>a<br>b</p><p>c</p>");
	});

	it("serializes paragraphs as \\n\\n and soft breaks as \\n (Markdown)", () => {
		const root = makeRoot("<p>a<br>b</p><p>c</p>");
		expect(serialize(root, "markdown", [], md, true)).toBe("a\nb\n\nc");
	});

	it("deserializes HTML paragraphs back to <p>/<br>", () => {
		expect(deserialize("<p>a<br>b</p><p>c</p>", "html", [], md, true)).toBe("<p>a<br>b</p><p>c</p>");
	});

	it("deserializes Markdown \\n\\n paragraphs and \\n soft breaks", () => {
		expect(deserialize("a\nb\n\nc", "markdown", [], md, true)).toBe("<p>a<br>b</p><p>c</p>");
	});

	it("wraps stray top-level content into a <p>", () => {
		expect(deserialize("hello", "html", [], md, true)).toBe("<p>hello</p>");
	});

	it("drops trailing placeholder <br> (soft break is meaningful only between content)", () => {
		expect(serialize(makeRoot("<p>ab<br></p>"), "markdown", [], md, true)).toBe("ab");
		expect(serialize(makeRoot("<p>ab<br><br></p>"), "markdown", [], md, true)).toBe("ab");
		expect(serialize(makeRoot("<p>ab<br>cd</p>"), "markdown", [], md, true)).toBe("ab\ncd"); // в середине — сохраняется
	});
});

describe("normalizeWhitespace", () => {
	it("collapses repeated spaces and trims the edges", () => {
		const root = makeRoot("  a   b  ");
		normalizeWhitespace(root);
		expect(root.textContent).toBe("a b");
	});

	it("normalizes whitespace across inline formatting tags", () => {
		const root = makeRoot("<b>a  </b>  b");
		normalizeWhitespace(root);
		expect(root.textContent).toBe("a b");
		expect(root.querySelector("b")).not.toBeNull();
	});

	it("trims each line independently and keeps the line break", () => {
		const root = makeRoot("a  b <br>  c   d ");
		normalizeWhitespace(root);
		expect(root.innerHTML).toBe("a b<br>c d");
	});

	it("drops a tag that becomes empty after trimming", () => {
		const root = makeRoot("<b>  </b>x");
		normalizeWhitespace(root);
		expect(root.querySelector("b")).toBeNull();
		expect(root.textContent).toBe("x");
	});

	// contenteditable подставляет U+00A0 вместо пробела, который иначе схлопнулся бы при
	// отображении, — без этого набранные подряд пробелы не схлопывались бы, а U+00A0 уезжал
	// бы в сохраняемое значение
	it("treats a non-breaking space as an ordinary one", () => {
		const root = makeRoot("a \u00A0b\u00A0 c\u00A0");
		normalizeWhitespace(root);
		expect(root.textContent).toBe("a b c");
	});

	it("collapses non-breaking spaces per line", () => {
		const root = makeRoot("a\u00A0\u00A0b<br>\u00A0c\u00A0");
		normalizeWhitespace(root);
		expect(root.innerHTML).toBe("a b<br>c");
	});
});

describe("normalizeParagraphs", () => {
	// последний пустой абзац остаётся: это место, где оставили каретку (в значение он не идёт)
	it("removes empty paragraphs anywhere but the last one", () => {
		const root = makeRoot("<p><br></p><p>a</p><p><br></p><p>b</p><p><br></p>");
		normalizeParagraphs(root);
		expect(root.innerHTML).toBe("<p>a</p><p>b</p><p><br></p>");
	});

	it("removes consecutive empty paragraphs", () => {
		const root = makeRoot("<p>a</p><p><br></p><p><br></p><p><br></p><p>b</p>");
		normalizeParagraphs(root);
		expect(root.innerHTML).toBe("<p>a</p><p>b</p>");
	});

	it("treats whitespace-only paragraphs as empty", () => {
		const root = makeRoot("<p>  </p><p>a</p>");
		normalizeParagraphs(root);
		expect(root.innerHTML).toBe("<p>a</p>");
	});

	it("removes all paragraphs when there is no content", () => {
		const root = makeRoot("<p><br></p><p><br></p>");
		normalizeParagraphs(root);
		expect(root.innerHTML).toBe("");
	});
});

describe("isFormatActive", () => {
	it("reports active when the selection is fully formatted", () => {
		const root = makeRoot("<b>bar</b>");
		const text = root.querySelector("b")!.firstChild!;
		const sel = select(text, 0, text, 3);

		expect(isFormatActive(root, sel.getRangeAt(0), "bold")).toBe(true);
		expect(isFormatActive(root, sel.getRangeAt(0), "italic")).toBe(false);
	});

	it("reports inactive when only part of the selection is formatted", () => {
		const root = makeRoot("foo<b>bar</b>");
		const foo = root.firstChild!;
		const bar = root.querySelector("b")!.firstChild!;
		const sel = select(foo, 0, bar, 3);

		expect(isFormatActive(root, sel.getRangeAt(0), "bold")).toBe(false);
	});
});

/**
 * Чужие диалекты того же инструмента: `*жирный*` — родная разметка WhatsApp, и так размечены
 * сообщения, набранные до редактора. Показывать их звёздочками — показывать не то, что увидит
 * получатель, а переписывать под свой маркер нельзя: открыть и закрыть сообщение меняло бы текст.
 */
describe("markdown dialects", () => {
	const md = defaultFormatMarkers();
	const tools: FormatTool[] = ["bold", "italic", "strike", "underline"];
	const parse = (text: string, markers = md) => deserialize(text, "markdown", tools, markers);
	const print = (html: string, markers = md) => serialize(makeRoot(html), "markdown", tools, markers);

	it("parses the alias marker", () => {
		expect(parse("*жирный*")).toBe('<b data-md="*">жирный</b>');
		expect(parse("**жирный**")).toBe("<b>жирный</b>");
	});

	it.each([["*жирный* текст"], ["**жирный** текст"], ["*раз* и **два**"], ["*жирный _и курсив_*"]])(
		"round-trips %j unchanged",
		(value) => {
			expect(print(parse(value))).toBe(value);
		}
	);

	// в поле ставится настроенный маркер, каким бы ни был текст вокруг
	it("prints the configured marker for what was formatted in the field", () => {
		expect(print('<b data-md="*">раз</b> и <b>два</b>')).toBe("*раз* и **два**");
		expect(print("<b>раз</b>")).toBe("**раз**");
	});

	// маркер из другого инструмента чужим диалектом не считается
	it("ignores a remembered marker that is not its own", () => {
		expect(print('<b data-md="_">раз</b>')).toBe("**раз**");
	});

	// одиночная звёздочка не должна собираться из половинок двойной
	it.each([["5**4 = 20, 3**2 = 6"], ["2 ** 2 ** 2"], ["3 * 4 = 12"], ["звёздочка * одна"]])(
		"leaves %j as text",
		(value) => {
			expect(parse(value)).toBe(value);
		}
	);

	// настройка меняет маркер местами: свой становится чужим диалектом
	it("takes the registry marker as the alias when the configured one differs", () => {
		const markers = defaultFormatMarkers();
		markers.bold = "*";

		expect(parse("*жирный*", markers)).toBe("<b>жирный</b>");
		expect(parse("**жирный**", markers)).toBe('<b data-md="**">жирный</b>');
		expect(print(parse("**жирный**", markers), markers)).toBe("**жирный**");
		expect(print("<b>жирный</b>", markers)).toBe("*жирный*");
	});
});

// Round-trip: то, что сериализовалось в значение, обязано прочитаться из него тем же смыслом.
describe("markdown round-trip", () => {
	const md = defaultFormatMarkers();
	const tools: FormatTool[] = ["bold", "italic", "code", "link"];
	const print = (html: string) => serialize(makeRoot(html), "markdown", tools, md);
	const parse = (value: string) => deserialize(value, "markdown", tools, md);

	// маркер не пересекает перенос строки — размечается каждая строка отдельно
	it("splits a marker spanning a soft break into per-line markers", () => {
		expect(print("<b>раз<br>два</b>")).toBe("**раз**\n**два**");
		expect(parse("**раз**\n**два**")).toBe("<b>раз</b><br><b>два</b>");
	});

	// перенос внутри кода — содержимое, а не склейка строк
	it("keeps the soft break inside pasted code", () => {
		expect(print("<code>раз<br>два</code>")).toBe("`раз`\n`два`");
	});

	// адрес с вложенными скобками разбор не прочитает голым — только в угловых скобках
	it("angle-wraps a url with nested parentheses", () => {
		const value = print('<a href="http://ex.com/a(b(c))">т</a>');
		expect(value).toBe("[т](<http://ex.com/a(b(c))>)");
		expect(parse(value)).toBe('<a href="http://ex.com/a(b(c))">т</a>');
	});

	// один уровень скобок остаётся голым — им кончается половина ссылок на википедию
	it("keeps single-level parentheses bare", () => {
		const value = print('<a href="http://ex.com/a(b)">т</a>');
		expect(value).toBe("[т](http://ex.com/a(b))");
		expect(parse(value)).toBe('<a href="http://ex.com/a(b)">т</a>');
	});

	// бэктики в адресе — буквальные символы, а не разметка кода
	it("keeps backticks inside a link url literal", () => {
		expect(parse("[т](http://ex.com/`x`)")).toBe('<a href="http://ex.com/`x`">т</a>');
	});
});

// Снятие формата с куска, делящего вложенный тег с чужим текстом: наружу выносится только
// выделенное, а не вся ветка.
describe("unwrap with shared nested formatting", () => {
	it("keeps the format on the unselected part of a nested tag", () => {
		const root = makeRoot("<b><i>hello world</i></b>");
		const text = root.querySelector("i")!.firstChild!;
		select(text, 0, text, 5);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<i>hello</i><b><i> world</i></b>");
	});

	it("splits the nested tag on both sides of the selection", () => {
		const root = makeRoot("<b><i>ab cd ef</i></b>");
		const text = root.querySelector("i")!.firstChild!;
		select(text, 3, text, 5);

		toggle(root, "bold");

		expect(root.innerHTML).toBe("<b><i>ab </i></b><i>cd</i><b><i> ef</i></b>");
	});
});

// Пересчёт смещения каретки после нормализации пробелов: nbsp, который браузер подставляет
// сам, выравнивается с обычным пробелом, а не срывает выравнивание.
describe("mapCharOffset", () => {
	it("aligns a collapsed nbsp with the plain space", () => {
		expect(mapCharOffset("a\u00A0bc", "a bc", 4)).toBe(4);
	});

	it("still accounts for removed characters", () => {
		expect(mapCharOffset("a  b", "a b", 4)).toBe(3);
	});
});

// Выделение, вытянутое из редактора на страницу, правкам не принадлежит.
describe("innerSelection", () => {
	it("rejects a selection whose focus lies outside the root", () => {
		const root = makeRoot("абв");
		const outside = document.createElement("span");
		outside.textContent = "снаружи";
		document.body.appendChild(outside);

		const sel = window.getSelection()!;
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(root.firstChild!, 0);
		range.setEnd(outside.firstChild!, 2);
		sel.addRange(range);

		expect(innerSelection(root)).toBeNull();
	});
});

// html-хранение: перенос внутри кода остаётся тегом. Сырой \n в значении виден переносом
// только под pre-wrap самого редактора — потребитель, рендерящий значение в обычном
// контейнере, склеил бы строки.
describe("html storage code breaks", () => {
	const md = defaultFormatMarkers();
	const tools: FormatTool[] = ["bold", "code"];

	it("keeps the soft break inside code as a tag", () => {
		const value = serialize(makeRoot("<code>раз<br>два</code>"), "html", tools, md);
		expect(value).toBe("<code>раз<br>два</code>");
		expect(deserialize(value, "html", tools, md)).toBe("<code>раз<br>два</code>");
	});
});

// Дешёвая предпроверка paragraphsNormalized обязана быть точным зеркалом ensureParagraphs:
// разойдись они — нормализация при наборе молча выключается (см. __ensureParagraphs).
describe("paragraphsNormalized mirrors ensureParagraphs", () => {
	it.each([
		["<p>a</p>"],
		["<p>a</p><p>b</p>"],
		["текст без абзаца"],
		["<b>инлайн</b>"],
		["<div>чужой абзац</div>"],
		["<p></p>"],
		["<p><br></p>"],
		["<p>a<br></p>"],
		["<p>a<br><br></p>"],
		["<p><br>a</p>"],
		["<p>a</p>хвост"],
		["<blockquote>q</blockquote>"],
		["<blockquote>q<br></blockquote>"],
		["<pre>код<br></pre>"],
		["<p>a</p><div>b</div><p>c</p>"],
	])("agrees with ensureParagraphs on %j", (html) => {
		const root = makeRoot(html);
		const predicted = paragraphsNormalized(root);

		expect(ensureParagraphs(root)).toBe(!predicted);
	});
});
