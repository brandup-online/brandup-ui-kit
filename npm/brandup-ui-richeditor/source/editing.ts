// Низкоуровневые операции редактирования на чистом Selection/Range: абзацы, мягкие переносы,
// каретка, расширение/обрезка выделения. Без состояния редактора и без истории —
// вызывающий сам решает, когда записывать undo-шаг.

function isBlock(node: Node): boolean {
	return (
		node.nodeType === Node.ELEMENT_NODE &&
		((node as Element).tagName === "P" || (node as Element).tagName === "DIV")
	);
}

function emptyParagraph(): HTMLParagraphElement {
	const p = document.createElement("p");
	p.appendChild(document.createElement("br"));
	return p;
}

// убирает пустые текст-узлы и ставит <br>-заполнитель в пустой абзац (для видимости и каретки)
function fillEmptyParagraph(p: HTMLElement) {
	p.normalize(); // удаляет пустые Text-узлы, склеивает соседние
	if (!p.firstChild) p.appendChild(document.createElement("br"));
}

function caretToStart(node: Node) {
	const range = document.createRange();
	range.setStart(node, 0);
	range.collapse(true);
	const selection = window.getSelection();
	if (selection) {
		selection.removeAllRanges();
		selection.addRange(range);
	}
}

/** Каретка в конец содержимого: в multiline — в конец последнего абзаца, иначе в конец редактора. */
export function caretToEnd(editable: HTMLElement, multiline: boolean) {
	const range = document.createRange();
	// multiline: каретку в конец последнего абзаца (а не на уровень редактора),
	// иначе и ввод, и Enter попадают мимо <p>
	const last = multiline ? editable.lastElementChild : null;
	range.selectNodeContents(last && isBlock(last) ? last : editable);
	range.collapse(false);
	const sel = window.getSelection();
	if (sel) {
		sel.removeAllRanges();
		sel.addRange(range);
	}
}

/** Фокус и выделение всего содержимого (например, readonly-режим). */
export function selectAllContent(editable: HTMLElement) {
	editable.focus();
	window.getSelection()?.selectAllChildren(editable);
}

/** Enter в multiline: разбить текущий абзац по каретке на два <p>. */
export function insertParagraph(editable: HTMLElement) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || !editable.contains(selection.anchorNode)) return;

	const range = selection.getRangeAt(0);
	range.deleteContents();

	// текущий абзац (ближайший <p>/<div> внутри редактора)
	let para: Node | null = range.startContainer;
	while (para && para !== editable && !isBlock(para)) para = para.parentNode;

	// каретка не внутри абзаца — создаём абзац сразу с видимым результатом (иначе Enter «срабатывает со 2-го раза»)
	if (!para || para === editable) {
		const next = emptyParagraph();
		if (editable.childNodes.length === 0) {
			// пустой редактор: пустая строка-источник + новая строка с кареткой
			editable.appendChild(emptyParagraph());
			editable.appendChild(next);
		} else {
			// каретка на уровне редактора между/после абзацев — вставляем новый абзац в эту позицию
			const ref = editable.childNodes[range.startOffset] ?? null;
			editable.insertBefore(next, ref);
		}
		caretToStart(next);
		return;
	}

	// выносим содержимое от каретки до конца абзаца в новый <p>
	const tail = document.createRange();
	tail.selectNodeContents(para);
	tail.setStart(range.endContainer, range.endOffset);
	const fragment = tail.extractContents();

	const next = document.createElement("p");
	next.appendChild(fragment);
	(para as ChildNode).after(next);

	// extractContents в конце абзаца оставляет пустой текст-узел → <p></p> без заполнителя
	// (невидим/нефокусируем, каретка не встаёт). Чистим и ставим <br> в опустевшие абзацы.
	fillEmptyParagraph(para as HTMLElement);
	fillEmptyParagraph(next);

	caretToStart(next);
}

/** Shift/Ctrl+Enter в multiline: вставить мягкий перенос <br>. */
export function insertSoftBreak(editable: HTMLElement) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || !editable.contains(selection.anchorNode)) return;

	const range = selection.getRangeAt(0);
	range.deleteContents();

	const br = document.createElement("br");
	range.insertNode(br);

	// insertNode в конце текст-узла расщепляет его и оставляет пустой хвост — убираем,
	// иначе br.nextSibling != null и заполнитель не ставится (перенос в конце строки не виден)
	const next = br.nextSibling;
	if (next && next.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === "") next.remove();

	const after = document.createRange();
	if (!br.nextSibling) {
		// перенос в конце строки — нужен второй <br>-заполнитель, иначе новая строка не отображается
		// (хвостовой <br> отбрасывается при сериализации)
		const pad = document.createElement("br");
		br.after(pad);
		after.setStartBefore(pad);
	} else {
		after.setStartAfter(br);
	}
	after.collapse(true);
	selection.removeAllRanges();
	selection.addRange(after);
}

/** Вставляет санитизированные абзацы <p> в позицию каретки, разбивая текущий абзац. */
export function insertPastedParagraphs(editable: HTMLElement, paras: HTMLElement[], range: Range) {
	let para: Node | null = range.startContainer;
	while (para && para !== editable && !isBlock(para)) para = para.parentNode;

	// каретка не внутри абзаца (пустой редактор / уровень редактора) — вставляем абзацы как есть
	if (!para || para === editable) {
		const ref = editable.childNodes[range.startOffset] ?? null;
		for (const p of paras) editable.insertBefore(p, ref);
		return;
	}

	const block = para as HTMLElement;

	// хвост текущего абзаца после каретки — выносим, чтобы вернуть в конец вставки
	const tailRange = document.createRange();
	tailRange.selectNodeContents(block);
	tailRange.setStart(range.startContainer, range.startOffset);
	const tail = tailRange.extractContents();

	// первый вставляемый абзац вливается в текущий (после содержимого до каретки)
	while (paras[0].firstChild) block.appendChild(paras[0].firstChild);

	if (paras.length === 1) {
		block.appendChild(tail); // один абзац: содержимое-до + вставка + хвост в одном <p>
		return;
	}

	// остальные абзацы — отдельными <p> после текущего; хвост — в конец последнего
	let anchor: ChildNode = block;
	for (let i = 1; i < paras.length; i++) {
		anchor.after(paras[i]);
		anchor = paras[i];
	}
	paras[paras.length - 1].appendChild(tail);
}

/** Обрезает пробелы по краям абзаца (после схлопывания) — у крайних текстовых узлов. */
export function trimParagraphEdges(p: HTMLElement) {
	const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
	const texts: Text[] = [];
	for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) texts.push(t);
	if (!texts.length) return;

	texts[0].textContent = (texts[0].textContent ?? "").replace(/^ /, "");
	const last = texts[texts.length - 1];
	last.textContent = (last.textContent ?? "").replace(/ $/, "");
}

/** Расширяет выделение до целых слов на границах (для применения формата к слову целиком). */
export function expandSelectionToWords(editable: HTMLElement, selection: Selection) {
	const range = selection.getRangeAt(0);

	const { startContainer, endContainer } = range;
	let startOffset = range.startOffset;
	let endOffset = range.endOffset;

	if (startContainer.nodeType === Node.TEXT_NODE && editable.contains(startContainer)) {
		const text = startContainer.textContent ?? "";
		while (startOffset > 0 && !/\s/.test(text[startOffset - 1])) startOffset--;
	}

	if (endContainer.nodeType === Node.TEXT_NODE && editable.contains(endContainer)) {
		const text = endContainer.textContent ?? "";
		while (endOffset < text.length && !/\s/.test(text[endOffset])) endOffset++;
	}

	if (startOffset === range.startOffset && endOffset === range.endOffset) return;

	const expanded = document.createRange();
	expanded.setStart(startContainer, startOffset);
	expanded.setEnd(endContainer, endOffset);
	selection.removeAllRanges();
	selection.addRange(expanded);
}

/** Убирает пробелы по краям выделения (например, после двойного клика по слову). */
export function trimSelectionWhitespace(editable: HTMLElement) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

	const range = selection.getRangeAt(0);
	if (!editable.contains(range.startContainer) || !editable.contains(range.endContainer)) return;

	const { startContainer, endContainer } = range;
	let startOffset = range.startOffset;
	let endOffset = range.endOffset;

	if (startContainer.nodeType === Node.TEXT_NODE) {
		const text = startContainer.textContent ?? "";
		while (startOffset < text.length && /\s/.test(text[startOffset])) startOffset++;
	}
	if (endContainer.nodeType === Node.TEXT_NODE) {
		const text = endContainer.textContent ?? "";
		while (endOffset > 0 && /\s/.test(text[endOffset - 1])) endOffset--;
	}

	if (startContainer === endContainer && startOffset >= endOffset) return;
	if (startOffset === range.startOffset && endOffset === range.endOffset) return;

	const trimmed = document.createRange();
	trimmed.setStart(startContainer, startOffset);
	trimmed.setEnd(endContainer, endOffset);
	selection.removeAllRanges();
	selection.addRange(trimmed);
}
