/**
 * @jest-environment jsdom
 *
 * Свойства, которые обязаны держаться на любом содержимом. Обе функции переписаны ради скорости
 * (очередь затронутых узлов вместо пересбора по корню; один обход вместо обхода на инструмент),
 * и проверяются они на случайной разметке, а не на разобранных вручную случаях.
 */
import { cleanupFormatting, activeFormats, isFormatActive } from "../source/selection";
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
function randomMarkup(rand: () => number, depth = 0): string {
	const parts: string[] = [];
	const count = 1 + Math.floor(rand() * 3);

	for (let i = 0; i < count; i++) {
		if (rand() < 0.3 || depth > 2) {
			parts.push(rand() < 0.2 ? "" : "abcdef"[Math.floor(rand() * 6)]);
		} else {
			const tag = TAGS[Math.floor(rand() * TAGS.length)];
			parts.push(`<${tag}>${randomMarkup(rand, depth + 1)}</${tag}>`);
		}
	}

	return parts.join("");
}

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

			cleanupFormatting(root);
			const cleaned = root.innerHTML;

			// текст неприкосновенен — чистится только разметка
			expect(root.textContent).toBe(text);

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
		const touched = textNodes(root).filter((n) => n.length && range.intersectsNode(n));

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
