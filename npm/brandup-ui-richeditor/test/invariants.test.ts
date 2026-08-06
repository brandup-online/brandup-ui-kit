/**
 * @jest-environment jsdom
 *
 * Свойства, которые обязаны держаться на любом содержимом. Обе функции переписаны ради скорости
 * (очередь затронутых узлов вместо пересбора по корню; один обход вместо обхода на инструмент),
 * и проверяются они на случайной разметке, а не на разобранных вручную случаях.
 */
import {
	cleanupFormatting,
	activeFormats,
	isFormatActive,
	selectionCharBounds,
	restoreSelection,
	toggleFormat,
} from "../source/selection";
import { ALL_FORMAT_TOOLS, FORMAT_TOOLS, type FormatTool } from "../source/format-config";

// Детерминированный ГПСЧ: падение воспроизводится по номеру итерации.
function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

const TAGS = ["b", "i", "s", "u"];

// Разметка с вложенными, смежными и пустыми тегами — именно её и разгребает cleanupFormatting.
// Переносы строк тут не для красоты: тег, пустой по тексту, но с переносом внутри, удалять
// нельзя — вместе с ним пропадёт разделение строк.
function randomMarkup(rand: () => number, depth = 0): string {
	const parts: string[] = [];
	const count = 1 + Math.floor(rand() * 3);

	for (let i = 0; i < count; i++) {
		const dice = rand();

		if (dice < 0.15) parts.push("<br>");
		else if (dice < 0.4 || depth > 2) parts.push(rand() < 0.2 ? "" : "abcdef"[Math.floor(rand() * 6)]);
		else {
			const tag = TAGS[Math.floor(rand() * TAGS.length)];
			parts.push(`<${tag}>${randomMarkup(rand, depth + 1)}</${tag}>`);
		}
	}

	return parts.join("");
}

const countBreaks = (root: HTMLElement) => root.querySelectorAll("br").length;

function makeRoot(html: string) {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

function textNodes(root: HTMLElement): Text[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) nodes.push(n);
	return nodes;
}

describe("cleanupFormatting invariants", () => {
	const rand = rng(20260805);

	it("never changes the text and leaves nothing more to clean up", () => {
		for (let i = 0; i < 2000; i++) {
			const html = randomMarkup(rand);
			const root = makeRoot(html);
			const text = root.textContent;
			const breaks = countBreaks(root);

			cleanupFormatting(root);
			const cleaned = root.innerHTML;

			// текст неприкосновенен — чистится только разметка
			expect(root.textContent).toBe(text);
			// как и переносы строк: их уносил с собой удаляемый пустой тег
			expect(countBreaks(root)).toBe(breaks);

			// повторный проход ничего не находит: очередь не могла пропустить «грязный» узел
			cleanupFormatting(root);
			expect(root.innerHTML).toBe(cleaned);
		}
	});

	it("leaves no empty, nested or adjacent duplicate tags", () => {
		for (let i = 0; i < 2000; i++) {
			const root = makeRoot(randomMarkup(rand));
			cleanupFormatting(root);

			for (const el of Array.from(root.querySelectorAll<HTMLElement>("b,i,s,u"))) {
				expect(el.textContent).not.toBe("");

				const parent = el.parentElement;
				if (parent && parent !== root) expect(parent.tagName).not.toBe(el.tagName);

				const prev = el.previousSibling;
				if (prev && prev.nodeType === Node.ELEMENT_NODE)
					expect((prev as HTMLElement).tagName).not.toBe(el.tagName);
			}
		}
	});
});

describe("activeFormats invariants", () => {
	const rand = rng(31337);

	// Прямолинейный эталон: обходим ВСЁ содержимое и ищем предка по именам тегов. Оптимизированная
	// версия сужает обход до общего предка границ и выходит раньше, поэтому сверять её есть с чем.
	function activeToolsReference(root: HTMLElement, range: Range): FormatTool[] {
		// Узел входит в выделение, если оно покрывает хоть один его символ. Касания одной лишь
		// границей мало: выделение кончается там, где узел начинается, или наоборот — выделенного
		// текста в нём нет, и оформление такого соседа к выделению отношения не имеет.
		const covered = (n: Text) => {
			const nr = document.createRange();
			nr.selectNodeContents(n);

			// начало выделения не раньше конца узла либо конец выделения не позже его начала
			if (range.compareBoundaryPoints(Range.END_TO_START, nr) >= 0) return false;
			if (range.compareBoundaryPoints(Range.START_TO_END, nr) <= 0) return false;

			return true;
		};

		const touched = textNodes(root).filter((n) => n.length && covered(n));

		const formatted = (node: Node, tags: string[]) => {
			for (let el = node.parentElement; el && el !== root; el = el.parentElement)
				if (tags.includes(el.tagName)) return true;

			return false;
		};

		if (range.collapsed) {
			const node = range.startContainer;
			const probe = node.nodeType === Node.TEXT_NODE ? node : (node.childNodes[range.startOffset] ?? node);
			return ALL_FORMAT_TOOLS.filter((tool) => formatted(probe, FORMAT_TOOLS[tool].matchTags));
		}

		if (!touched.length) return [];

		return ALL_FORMAT_TOOLS.filter((tool) => touched.every((n) => formatted(n, FORMAT_TOOLS[tool].matchTags)));
	}

	it("agrees with a full-content reference on random selections", () => {
		let checked = 0;

		for (let i = 0; i < 1500; i++) {
			const root = makeRoot(randomMarkup(rand));
			const texts = textNodes(root);
			if (!texts.length) continue;

			const a = texts[Math.floor(rand() * texts.length)];
			const b = texts[Math.floor(rand() * texts.length)];
			const range = document.createRange();
			try {
				range.setStart(a, Math.floor(rand() * (a.length + 1)));
				range.setEnd(b, Math.floor(rand() * (b.length + 1)));
			} catch {
				continue; // конец раньше начала — таким выделение не бывает
			}

			const expected = activeToolsReference(root, range);

			expect(Array.from(activeFormats(root, range, ALL_FORMAT_TOOLS)).sort()).toEqual(expected.sort());
			// одиночный опрос обязан давать тот же ответ, что и общий
			for (const tool of ALL_FORMAT_TOOLS)
				expect(isFormatActive(root, range, tool)).toBe(expected.includes(tool));

			checked++;
		}

		expect(checked).toBeGreaterThan(1000); // выборка действительно набралась
	});

	it("returns nothing for an empty tool set", () => {
		const root = makeRoot("<b>abc</b>");
		const range = document.createRange();
		range.selectNodeContents(root);

		expect(activeFormats(root, range, [] as FormatTool[]).size).toBe(0);
	});
});

/**
 * Координаты каретки: конец строки и начало следующей обязаны различаться, иначе восстановленная
 * по смещениям каретка возвращается на строку выше (это видно сразу после Enter). Проверяется
 * на случайном содержимом с переносами и блоками — именно их и считает модель.
 */
describe("char offsets invariants", () => {
	const rand = rng(76543);

	// Строки с мягкими переносами внутри блоков и пустыми строками — на них модель и спотыкалась.
	function randomContent(): string {
		const blocks: string[] = [];

		for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
			const lines: string[] = [];
			for (let j = 0; j < 1 + Math.floor(rand() * 3); j++) {
				const text = "abcdef".slice(0, Math.floor(rand() * 6));
				lines.push(rand() < 0.3 ? `<b>${text}</b>` : text);
			}

			const tag = rand() < 0.3 ? "blockquote" : "p";
			blocks.push(`<${tag}>${lines.join("<br>")}</${tag}>`);
		}

		return blocks.join("");
	}

	// Все позиции каретки: внутри текста и на концах строк (после <br> и в начале блока).
	function positions(root: HTMLElement): Array<[Node, number]> {
		const list: Array<[Node, number]> = [];
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);

		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			if (n.nodeType === Node.TEXT_NODE) {
				for (let i = 0; i <= (n as Text).length; i++) list.push([n, i]);
			} else if (n.nodeName === "BR" && n.parentNode) {
				list.push([n.parentNode, Array.prototype.indexOf.call(n.parentNode.childNodes, n) + 1]);
			}
		}

		return list;
	}

	it("tells the end of a line from the start of the next one", () => {
		let checked = 0;

		for (let i = 0; i < 300; i++) {
			const root = makeRoot(randomContent());
			const selection = window.getSelection()!;

			for (const [node, offset] of positions(root)) {
				const range = document.createRange();
				range.setStart(node, offset);
				range.collapse(true);

				const [start] = selectionCharBounds(root, range);

				selection.removeAllRanges();
				selection.addRange(range);
				restoreSelection(root, start, start, selection);

				const restored = selection.getRangeAt(0);
				expect(selectionCharBounds(root, restored)[0]).toBe(start);

				// Вернулись ровно туда же: между исходной позицией и восстановленной нет ни
				// символа, ни переноса. Одного совпадения смещений мало — пока конец строки
				// и начало следующей были неразличимы, каретка «возвращалась» строкой выше,
				// и смещение у неё, разумеется, совпадало.
				const forward = range.compareBoundaryPoints(Range.START_TO_START, restored) <= 0;
				const [from, to] = forward ? [range, restored] : [restored, range];

				const gap = document.createRange();
				gap.setStart(from.startContainer, from.startOffset);
				gap.setEnd(to.startContainer, to.startOffset);

				expect(gap.toString()).toBe("");
				expect(gap.cloneContents().querySelector("br")).toBeNull();

				checked++;
			}
		}

		expect(checked).toBeGreaterThan(1000);
	});
});

// Внутри моноширинного разметки нет: значение берёт оттуда голый текст, и всё, что попало
// внутрь вставкой или правкой, обязано быть снято чисткой.
describe("code content invariants", () => {
	const rand = rng(24680);

	it("leaves no formatting inside code", () => {
		for (let i = 0; i < 500; i++) {
			const root = makeRoot(`<code>${randomMarkup(rand)}</code>${randomMarkup(rand)}`);
			const text = root.textContent;

			cleanupFormatting(root);

			expect(root.textContent).toBe(text); // текст неприкосновенен
			expect(root.querySelector("code b, code i, code s, code u, code code")).toBeNull();
		}
	});
});

/**
 * Наложение и снятие формата на произвольном выделении. Проверяется не разметка (её вид зависит
 * от того, где прошли границы), а то, что обязано держаться всегда: текст, переносы строк и блоки
 * не меняются, наложенный формат виден на том же выделении, а снятый исчезает без следа.
 */
describe("toggleFormat invariants", () => {
	const rand = rng(5150);

	// Содержимое без форматирования: блоки, строки и пустые строки внутри них.
	function randomLines(): string {
		const blocks: string[] = [];

		for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
			const lines: string[] = [];
			for (let j = 0; j < 1 + Math.floor(rand() * 4); j++) lines.push("abcdef".slice(0, Math.floor(rand() * 6)));

			const tag = rand() < 0.25 ? "blockquote" : "p";
			blocks.push(`<${tag}>${lines.join("<br>")}</${tag}>`);
		}

		return blocks.join("");
	}

	function randomRange(root: HTMLElement): Range | null {
		const texts = textNodes(root).filter((n) => n.length);
		if (texts.length < 1) return null;

		const a = texts[Math.floor(rand() * texts.length)];
		const b = texts[Math.floor(rand() * texts.length)];
		const range = document.createRange();

		try {
			range.setStart(a, Math.floor(rand() * (a.length + 1)));
			range.setEnd(b, Math.floor(rand() * (b.length + 1)));
		} catch {
			return null; // конец раньше начала — таким выделение не бывает
		}

		// Выделение без единого символа (одна лишь граница строк) форматировать нечего:
		// узлов, задетых текстом, в нём нет.
		return range.collapsed || !range.toString().length ? null : range;
	}

	it("keeps the text, the line breaks and the blocks", () => {
		let checked = 0;

		for (let i = 0; i < 1200; i++) {
			const root = makeRoot(randomLines());
			const range = randomRange(root);
			if (!range) continue;

			const tool = ALL_FORMAT_TOOLS[Math.floor(rand() * ALL_FORMAT_TOOLS.length)];
			const text = root.textContent;
			const breaks = countBreaks(root);
			const blocks = root.children.length;

			const selection = window.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);

			toggleFormat(root, selection.getRangeAt(0), tool, selection);

			expect(root.textContent).toBe(text);
			expect(countBreaks(root)).toBe(breaks);
			expect(root.children.length).toBe(blocks);
			expect(isFormatActive(root, selection.getRangeAt(0), tool)).toBe(true);

			// снятие тем же выделением возвращает содержимое к исходному
			toggleFormat(root, selection.getRangeAt(0), tool, selection);

			expect(root.textContent).toBe(text);
			expect(countBreaks(root)).toBe(breaks);
			expect(root.children.length).toBe(blocks);
			expect(root.querySelector(FORMAT_TOOLS[tool].tag)).toBeNull();

			checked++;
		}

		expect(checked).toBeGreaterThan(400); // выборка действительно набралась
	});
});
