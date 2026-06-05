// Нормализация содержимого редактора: схлопывание пробелов по строкам и приведение
// верхнего уровня к абзацам <p> (модель многострочного режима).

import { cleanupFormatting } from "./selection";

/**
 * Нормализует пробелы в редакторе: схлопывает повторяющиеся пробелы/табы в один
 * и обрезает пробелы по краям каждой строки. BR и блочные элементы (DIV/P) —
 * границы строк; инлайновое форматирование (b/i/s/u) на строки не влияет.
 */
export function normalizeWhitespace(root: HTMLElement) {
	type Item = { kind: "text"; node: Text } | { kind: "break" };
	const items: Item[] = [];

	const flatten = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				items.push({ kind: "text", node: child as Text });
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				if (el.tagName === "BR") {
					items.push({ kind: "break" });
				} else if (el.tagName === "DIV" || el.tagName === "P") {
					items.push({ kind: "break" });
					flatten(el);
					items.push({ kind: "break" });
				} else {
					flatten(el); // инлайновый тег — не разрывает строку
				}
			}
		}
	};
	flatten(root);

	let atLineStart = true;
	let pendingSpaceNode: Text | null = null; // узел, заканчивающийся пробелом (возможно хвостовым)

	for (const item of items) {
		if (item.kind === "break") {
			if (pendingSpaceNode) {
				pendingSpaceNode.data = pendingSpaceNode.data.replace(/ $/, "");
				pendingSpaceNode = null;
			}
			atLineStart = true;
			continue;
		}

		let text = item.node.data.replace(/[ \t]+/g, " ");
		if (atLineStart) text = text.replace(/^ /, ""); // пробел в начале строки
		if (pendingSpaceNode && text.startsWith(" ")) text = text.slice(1); // двойной пробел на границе узлов

		item.node.data = text;
		if (text.length === 0) continue;

		atLineStart = false;
		pendingSpaceNode = text.endsWith(" ") ? item.node : null;
	}

	if (pendingSpaceNode) pendingSpaceNode.data = pendingSpaceNode.data.replace(/ $/, ""); // хвост последней строки

	cleanupFormatting(root); // убрать опустевшие теги, склеить узлы
}

/**
 * Нормализует верхний уровень редактора к абзацам <p>: блуждающие текст/инлайн оборачиваются в <p>,
 * <div> заменяются на <p>, пустые абзацы получают <br>-заполнитель (чтобы строка была видимой).
 */
export function ensureParagraphs(root: HTMLElement) {
	let run: ChildNode[] = [];

	const flushRun = (before: Node | null) => {
		if (!run.length) return;
		const p = document.createElement("p");
		for (const node of run) p.appendChild(node);
		root.insertBefore(p, before);
		run = [];
	};

	for (const node of Array.from(root.childNodes)) {
		const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;

		if (el && (el.tagName === "P" || el.tagName === "DIV")) {
			flushRun(node);
			if (el.tagName === "DIV") {
				const p = document.createElement("p");
				while (el.firstChild) p.appendChild(el.firstChild);
				root.replaceChild(p, el);
			}
		} else {
			run.push(node);
		}
	}
	flushRun(null);

	for (const p of Array.from(root.querySelectorAll("p"))) {
		if (!p.firstChild) {
			p.appendChild(document.createElement("br")); // пустой абзац — заполнитель для видимости строки
			continue;
		}

		// в непустом абзаце убираем краевые <br>-заполнители: иначе введённый текст
		// оказывается рядом с лишним переносом (символ «съезжает» на новую строку).
		// Внутренние <br> (мягкие переносы) сохраняются.
		if ((p.textContent ?? "").length > 0) {
			while (p.firstChild && p.firstChild.nodeName === "BR") p.removeChild(p.firstChild);
			while (p.lastChild && p.lastChild.nodeName === "BR") p.removeChild(p.lastChild);
		}
	}
}
