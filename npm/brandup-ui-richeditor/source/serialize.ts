// Разбор и сериализация значения редактора (HTML | Markdown), модель абзацев и мягких переносов.

import { blockTypeOf } from "./paragraphs";
import {
	ALL_BLOCK_TYPES,
	BLOCK_TYPES,
	DEFAULT_BLOCK,
	FORMAT_TOOLS,
	defaultFormatMarkers,
	type BlockType,
	type FormatMarkers,
	type FormatStorage,
	type FormatTool,
} from "./format-config";

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Тег → инструмент, только для включённых инструментов. */
function buildTagMap(tools: FormatTool[]): Record<string, FormatTool> {
	const map: Record<string, FormatTool> = {};
	for (const tool of tools) for (const tag of FORMAT_TOOLS[tool].matchTags) map[tag] = tool;
	return map;
}

function lineBreak(storage: FormatStorage): string {
	return storage === "html" ? "<br>" : "\n";
}

function wrap(storage: FormatStorage, tool: FormatTool, inner: string, markers: FormatMarkers): string {
	if (!inner) return inner;

	const def = FORMAT_TOOLS[tool];
	if (storage === "html") return `<${def.tag}>${inner}</${def.tag}>`;

	const marker = markers[tool];

	// Маркер не сработает, если содержимое начинается или заканчивается пробелом, — ни у нас
	// при разборе, ни у мессенджера. Выносим краевые пробелы наружу: разметка сохраняется,
	// а иначе получатель увидел бы сами маркеры.
	const leading = /^\s*/.exec(inner)![0];
	const trailing = /\s*$/.exec(inner.slice(leading.length))![0];
	const core = inner.slice(leading.length, inner.length - trailing.length);
	if (!core) return inner; // одни пробелы — оборачивать нечего

	return `${leading}${marker}${core}${marker}${trailing}`;
}

// Сериализует инлайновое содержимое (текст, форматирование, <br> как мягкий перенос).
// Абзацы (<p>/<div>) на этом уровне не учитываются — их разбирает serializeParagraphs.
function serializeInline(
	nodes: ArrayLike<ChildNode>,
	storage: FormatStorage,
	tagMap: Record<string, FormatTool>,
	markers: FormatMarkers
): string {
	let result = "";

	for (const node of Array.from(nodes)) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? "";
			result += storage === "html" ? escapeHtml(text) : text;
			continue;
		}

		if (node.nodeType !== Node.ELEMENT_NODE) continue;

		const el = node as HTMLElement;
		const tag = el.tagName;

		if (tag === "BR") {
			result += lineBreak(storage); // мягкий перенос
			continue;
		}

		const tool = tagMap[tag];

		// В коде разметки нет: при разборе его содержимое не размечается, и вложенное
		// форматирование не вернулось бы — значение разошлось бы с тем, что было в поле.
		if (tool === "code") {
			const text = el.textContent ?? "";
			result += wrap(storage, tool, storage === "html" ? escapeHtml(text) : text, markers);
			continue;
		}

		const inner = serializeInline(el.childNodes, storage, tagMap, markers);

		// вложенный блочный элемент (нестандарт) — без обёртки, просто содержимое
		if (tag === "DIV" || tag === "P") {
			result += inner;
			continue;
		}

		// неизвестный или отключённый тег — отбрасываем обёртку, оставляем текст
		result += tool ? wrap(storage, tool, inner, markers) : inner;
	}

	return result;
}

// Хвостовые переносы абзаца отбрасываем — это <br>-заполнители, делающие последнюю строку видимой;
// мягкий перенос осмыслен только между содержимым (для пустой строки используйте новый абзац).
function trimTrailingBreaks(inline: string, storage: FormatStorage): string {
	return storage === "html" ? inline.replace(/(?:<br>)+$/, "") : inline.replace(/\n+$/, "");
}

// Разбивает верхний уровень на блоки: у каждого свой тип, у не попавшего в блок содержимого —
// тип по умолчанию. HTML: тег типа; Markdown: блоки через \n\n, мягкие переносы внутри — \n.
function serializeParagraphs(
	root: ParentNode,
	storage: FormatStorage,
	tagMap: Record<string, FormatTool>,
	markers: FormatMarkers,
	types: BlockType[],
	separate: boolean
): string {
	const blocks: Array<[BlockType, string]> = [];
	let buffer: ChildNode[] = [];

	// Содержимое блока: у типа без инлайновой разметки (код) — буквальный текст, у остальных
	// обычная сериализация. Дальше типы отличаются только оформлением готовых строк.
	const content = (type: BlockType, nodes: ArrayLike<ChildNode>): string => {
		if (BLOCK_TYPES[type].inline) return serializeInline(nodes, storage, tagMap, markers);

		const text = Array.from(nodes)
			.map((node) => (node.nodeName === "BR" ? "\n" : (node.textContent ?? "")))
			.join("");

		return storage === "html" ? escapeHtml(text) : text;
	};

	const flush = () => {
		if (buffer.length) blocks.push([DEFAULT_BLOCK, content(DEFAULT_BLOCK, buffer)]);
		buffer = [];
	};

	for (const node of Array.from(root.childNodes)) {
		const found = blockTypeOf(node);

		if (found) {
			// Отключённый тип пришёл со стороны (вставка, чужое значение) — сохраняем как обычный
			// блок: его разметки в значении всё равно не будет, а текст терять нельзя.
			const type = types.includes(found) ? found : DEFAULT_BLOCK;

			flush();
			blocks.push([type, content(type, (node as Element).childNodes)]);
		} else {
			buffer.push(node);
		}
	}
	flush();

	const cleaned = blocks.map(([type, text]) => [type, trimTrailingBreaks(text, storage)] as const);

	if (storage === "html")
		return cleaned
			.map(([type, text]) => {
				const tag = BLOCK_TYPES[type].tag;
				return `<${tag}>${text}</${tag}>`;
			})
			.join("");

	// Пустая строка между блоками нужна там, где она их и разделяет. Блок с собственной
	// разметкой (цитата, код) узнаётся и без неё, а в режиме мягких переносов пустая строка —
	// это пустая строка сообщения: поставив её от себя, редактор менял бы текст.
	return cleaned
		.map(([type, text], index) => {
			if (!index) return markdownBlock(type, text);

			const previous = cleaned[index - 1][0];
			const blank = separate || (previous === DEFAULT_BLOCK && type === DEFAULT_BLOCK);

			return `${blank ? "\n\n" : "\n"}${markdownBlock(type, text)}`;
		})
		.join("");
}

/** Оформляет готовое содержимое блока по правилам типа: ограждение, построчный маркер или ничего. */
function markdownBlock(type: BlockType, text: string): string {
	const def = BLOCK_TYPES[type];

	if (def.fence) return `${def.fence}\n${text}\n${def.fence}`;
	if (def.linePrefix)
		return text
			.split("\n")
			.map((line) => `${def.linePrefix}${line}`.trimEnd())
			.join("\n");

	return text;
}

/**
 * Сериализует содержимое редактора в строку для хранения. Сохраняются только включённые инструменты.
 * При paragraphs=true применяется модель «абзацы (<p>/\n\n) + мягкие переносы (<br>/\n)».
 */
export function serialize(
	root: HTMLElement,
	storage: FormatStorage,
	tools: FormatTool[],
	markers: FormatMarkers = defaultFormatMarkers(),
	paragraphs = false,
	types: BlockType[] = ALL_BLOCK_TYPES,
	separate = true
): string {
	const tagMap = buildTagMap(tools);

	if (paragraphs) return serializeParagraphs(root, storage, tagMap, markers, types, separate).trim();

	const inline = serializeInline(root.childNodes, storage, tagMap, markers);
	if (storage === "html")
		return inline
			.replace(/^(?:<br>)+/, "")
			.replace(/(?:<br>)+$/, "")
			.trim();
	return inline.replace(/^\n+/, "").replace(/\n+$/, "").trim();
}

/** Инструмент, его маркер и признак «содержимое не может начинаться/заканчиваться самим маркером». */
type MarkerRule = [tool: FormatTool, marker: string, standalone: boolean];

/**
 * Маркеры в порядке применения: длинный (`__`) раньше короткого-префикса (`_`), иначе
 * короткий съест половину длинного. Считается один раз на разбор — `markdownInline`
 * вызывается на каждый абзац.
 *
 * Если короткий маркер является префиксом длинного и принадлежит другой инструкции
 * (`_` курсив внутри `__` подчёркивания), длинный не должен захватывать лишний символ:
 * иначе `___текст___` разберётся как подчёркивание с `_` по краям вместо курсива поверх
 * подчёркивания. Так же поступают паттерны конвертеров.
 */
function orderedMarkers(tools: FormatTool[], markers: FormatMarkers): MarkerRule[] {
	const active = tools.filter((tool) => markers[tool]).sort((a, b) => markers[b].length - markers[a].length);

	return active.map((tool) => {
		const marker = markers[tool];
		const hasShorterPrefix = active.some((other) => {
			const value = markers[other];
			return value.length < marker.length && marker.startsWith(value);
		});

		return [tool, marker, hasShorterPrefix];
	});
}

const TAG = /<(\/?)([a-z]+)>/g;

/**
 * Закрыт ли в содержимом каждый тег, который в нём открыт.
 *
 * Маркеры применяются по очереди к уже размеченному тексту, поэтому пара маркеров может
 * пересечь чужой тег: `**a _b** c_` дал бы `<b>a <i>b</b> c</i>`, а такой HTML браузер
 * перестроит по-своему, и форматирование «протечёт» за пределы разметки. Пересекающуюся
 * пару оставляем текстом — так же поступают мессенджеры. Собственный текст пользователя
 * сюда не попадает: `<` в нём уже заэкранирован, тег может быть только нашим.
 */
function balancedTags(inner: string): boolean {
	if (!inner.includes("<")) return true;

	const stack: string[] = [];
	for (const [, closing, name] of inner.matchAll(TAG)) {
		if (!closing) stack.push(name);
		else if (stack.pop() !== name) return false;
	}

	return stack.length === 0;
}

// Метка места кода на время разбора: содержимое кода разметкой не считается, поэтому выносится
// до остальных маркеров и возвращается в конце.
//
// В тексте пользователя такой метки не бывает: он уже заэкранирован, и его `&` стал `&amp;`.
// Границам соседних маркеров она не мешает — по краям не буква и не цифра, а угловых скобок,
// на которые смотрит balancedTags, в ней нет.
const STASH_MARK = "&#0;";
const STASH_PATTERN = /&#0;(\d+)&#0;/g;

// Markdown-разметка одного абзаца → инлайновый HTML (escape, маркеры, \n→<br>).
function markdownInline(text: string, order: MarkerRule[]): string {
	let html = escapeHtml(text);

	// Код — первым: внутри него `*звёздочки*` остаются текстом, как у мессенджеров. Иначе
	// содержимое кода размечалось бы, и то, что человек написал буквально, уезжало бы жирным.
	const stash: string[] = [];
	const code = order.find(([tool]) => tool === "code");
	if (code) {
		html = html.replace(markerPattern(code[1], code[2]), (_match, lead: string, inner: string) => {
			stash.push(inner);

			return `${lead}${STASH_MARK}${stash.length - 1}${STASH_MARK}`;
		});
	}

	for (const [tool, marker, standalone] of order) {
		if (tool === "code") continue; // уже вынесен

		const def = FORMAT_TOOLS[tool];
		html = html.replace(markerPattern(marker, standalone), (match, lead: string, inner: string) =>
			balancedTags(inner) ? `${lead}<${def.tag}>${inner}</${def.tag}>` : match
		);
	}

	if (stash.length) {
		const def = FORMAT_TOOLS.code;
		html = html.replace(STASH_PATTERN, (_match, index: string) => `<${def.tag}>${stash[+index]}</${def.tag}>`);
	}

	// переносы — после маркеров: пока это \n, запрет на пересечение строки работает
	return html.replace(/\r?\n/g, "<br>");
}

/**
 * Разметка распознаётся по правилам мессенджеров: маркер стоит на границе слова, содержимое
 * не начинается и не заканчивается пробелом и не пересекает перенос строки. Иначе `5**4 = 20`
 * или `2 ** 2 ** 2` превращались бы в текст с форматированием, которого получатель не увидит.
 *
 * Граница — всё, что не буква и не цифра (включая `_`). Именно `\p{L}\p{N}`, а не `\W`:
 * в JavaScript `\w` — только ASCII, поэтому с `\W` каждая кириллическая буква считалась бы
 * границей и `файл_имя_файла` разбирался бы как разметка.
 *
 * Левая граница захватывается группой и возвращается на место — lookbehind не используется,
 * его нет в Safari до 16.4.
 *
 * Содержимое не начинается и с U+20E3: в keycap-последовательностях (`*⃣`, `#⃣`, `1⃣`) сам
 * маркер служит базовым символом, и без этого `*⃣раз*` разбиралось бы как разметка вместо эмодзи.
 *
 * При `standalone` содержимое дополнительно не начинается и не заканчивается символом самого
 * маркера — см. {@link orderedMarkers}.
 */
function markerPattern(marker: string, standalone: boolean): RegExp {
	const key = standalone ? `${marker}` : marker;

	let pattern = markerPatterns.get(key);
	if (pattern) return pattern;

	const escaped = escapeRegExp(marker);
	const boundary = "[^\\p{L}\\p{N}]";
	// символ маркера в классе — экранируем то, что в нём значимо
	const own = standalone ? marker.slice(-1).replace(/[\\\]^-]/g, "\\$&") : "";
	const head = `[^\\s\\u20e3${own}]`;
	const tail = standalone ? `[^\\s${own}]` : "\\S";

	pattern = new RegExp(`(^|${boundary})${escaped}(${head}|${head}[^\\n]*?${tail})${escaped}(?=$|${boundary})`, "gu");
	markerPatterns.set(key, pattern);

	return pattern;
}

// Набор маркеров за разбор не меняется, а разбор идёт по абзацам — компилируем каждую
// регулярку один раз. Флаг `g` переиспользовать безопасно: `replace` сбрасывает lastIndex.
const markerPatterns = new Map<string, RegExp>();

/**
 * Готовит сохранённое значение к отображению в редакторе (возвращает HTML).
 * При paragraphs=true строит <p>-абзацы; HTML-значения санитизируются до разрешённых тегов,
 * Markdown/Plain — разбивается на абзацы по \n\n (мягкий перенос \n → <br>).
 */
export function deserialize(
	value: string,
	storage: FormatStorage,
	tools: FormatTool[],
	markers: FormatMarkers = defaultFormatMarkers(),
	paragraphs = false,
	types: BlockType[] = ALL_BLOCK_TYPES,
	separate = true
): string {
	if (!value) return "";

	if (storage === "markdown") {
		const order = orderedMarkers(tools, markers);

		if (!paragraphs) return markdownInline(value, order);

		return markdownBlocks(value, types, separate)
			.map(([type, text]) => {
				const def = BLOCK_TYPES[type];
				const inner = def.inline ? markdownInline(text, order) : escapeHtml(text).replace(/\n/g, "<br>");

				return `<${def.tag}>${inner || "<br>"}</${def.tag}>`;
			})
			.join("");
	}

	// html: парсим и пересобираем, отбрасывая всё, кроме разрешённых тегов
	const template = document.createElement("template");
	template.innerHTML = value;
	const tagMap = buildTagMap(tools);

	if (!paragraphs) return serializeInline(template.content.childNodes, "html", tagMap, defaultFormatMarkers());

	return serializeParagraphs(template.content, "html", tagMap, defaultFormatMarkers(), types, separate).replace(
		/<([a-z]+)><\/\1>/g,
		"<$1><br></$1>"
	);
}

/**
 * Первый проход разбора: значение → последовательность блоков с их типом.
 *
 * Порядок проверок — от самой сильной разметки к самой слабой: огражденный блок забирает строки
 * целиком (внутри него разметки нет, в том числе чужих маркеров начала строки), затем идут подряд
 * идущие строки с построчным маркером, и лишь остаток разбивается на блоки по умолчанию пустой
 * строкой. Незакрытое ограждение разметкой не считается — его строки остаются текстом, как
 * у мессенджеров: иначе одна случайная кавычка съедала бы весь остаток сообщения.
 *
 * При `separate = false` пустая строка блоки не делит: в режиме мягких переносов она сама по себе
 * строка сообщения, и разбиение съедало бы её.
 */
function markdownBlocks(value: string, types: BlockType[], separate: boolean): Array<[BlockType, string]> {
	const fenced = types.filter((type) => BLOCK_TYPES[type].fence);
	const prefixed = types.filter((type) => BLOCK_TYPES[type].linePrefix);

	const lines = value.split(/\r?\n/);
	const blocks: Array<[BlockType, string]> = [];
	let buffer: string[] = [];

	const flush = () => {
		if (buffer.length) blocks.push([DEFAULT_BLOCK, buffer.join("\n")]);
		buffer = [];
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const fence = fenced.find((type) => line.trimEnd() === BLOCK_TYPES[type].fence);
		if (fence) {
			let close = -1;
			for (let at = i + 1; at < lines.length; at++)
				if (lines[at].trimEnd() === BLOCK_TYPES[fence].fence) {
					close = at;
					break;
				}

			if (close > i) {
				flush();
				blocks.push([fence, lines.slice(i + 1, close).join("\n")]);
				i = close;
				continue;
			}
		}

		// Маркер строки: пустая строка цитаты приходит без замыкающего пробела, поэтому
		// узнаём и маркер без него.
		const prefix = prefixed.find((type) => {
			const marker = BLOCK_TYPES[type].linePrefix!;
			return line.startsWith(marker) || line.trimEnd() === marker.trimEnd();
		});
		if (prefix) {
			const marker = BLOCK_TYPES[prefix].linePrefix!;
			const collected: string[] = [];

			while (i < lines.length) {
				const next = lines[i];
				if (next.startsWith(marker)) collected.push(next.slice(marker.length));
				else if (next.trimEnd() === marker.trimEnd()) collected.push("");
				else break;

				i++;
			}
			i--;

			flush();
			blocks.push([prefix, collected.join("\n")]);
			continue;
		}

		// Пустая строка разделяет блоки по умолчанию и в значение не попадает: пустой блок
		// сериализуется в пустую строку, поэтому сохранять его нечем и незачем.
		if (separate && !line.trim()) flush();
		else buffer.push(line);
	}
	flush();

	return blocks;
}
