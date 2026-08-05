// Собственная история undo/redo для редактора.
//
// Форматирование и работа с абзацами выполняются ручными DOM-операциями (Selection/Range),
// которые проходят мимо нативного стека истории браузера — нативный Ctrl+Z их не видит и,
// хуже того, ломается при смешивании с ручными мутациями. Поэтому ведём свою историю снимков
// (innerHTML + позиция выделения). Используется только при включённом форматировании.

import { documentSelection, innerSelection, restoreSelection, selectionCharBounds } from "./format";

interface Snapshot {
	html: string;
	start: number;
	end: number;
}

/** Вид правки: печать коалесится в один шаг, структурные операции — всегда отдельный шаг. */
export type HistoryKind = "type" | "op";

const COALESCE_MS = 300; // печать в пределах паузы — один шаг отмены
const MAX_DEPTH = 100; // ограничение глубины истории (память)
// Снимок — это весь innerHTML редактора, поэтому глубины мало: сто шагов на длинном тексте
// это мегабайты на одно поле. Ограничиваем ещё и суммарный объём, отбрасывая самые старые шаги.
const MAX_CHARS = 512 * 1024;

export class EditorHistory {
	private readonly __root: HTMLElement;
	private __undo: Snapshot[] = [];
	private __redo: Snapshot[] = [];
	private __lastKind: HistoryKind | null = null;
	private __lastTime = 0;
	private __chars = 0; // суммарный объём снимков отмены — см. MAX_CHARS

	constructor(root: HTMLElement) {
		this.__root = root;
	}

	/** Есть ли что отменять (для disabled-состояния кнопки). */
	get canUndo(): boolean {
		return this.__undo.length > 0;
	}

	/** Есть ли что повторять. */
	get canRedo(): boolean {
		return this.__redo.length > 0;
	}

	private __snapshot(): Snapshot {
		const sel = innerSelection(this.__root);
		const [start, end] = sel ? selectionCharBounds(this.__root, sel.getRangeAt(0)) : [0, 0];

		return { html: this.__root.innerHTML, start, end };
	}

	/**
	 * Запомнить текущее (до изменения) состояние. Вызывается перед каждой правкой.
	 * Печать (kind="type") коалесится: подряд идущие символы в пределах паузы — один шаг.
	 */
	record(kind: HistoryKind): void {
		const now = Date.now();
		if (kind === "type" && this.__lastKind === "type" && now - this.__lastTime < COALESCE_MS) {
			this.__lastTime = now;
			return;
		}
		this.__lastKind = kind;
		this.__lastTime = now;

		const snap = this.__snapshot();
		const top = this.__undo[this.__undo.length - 1];
		if (top && top.html === snap.html) return; // состояние не изменилось — не дублируем

		this.__undo.push(snap);
		this.__chars += snap.html.length;
		while (this.__undo.length > MAX_DEPTH || (this.__chars > MAX_CHARS && this.__undo.length > 1))
			this.__chars -= this.__undo.shift()!.html.length;

		this.__redo = [];
	}

	/** Откатить на шаг назад. Возвращает false, если откатывать нечего. */
	undo(): boolean {
		const prev = this.__undo.pop();
		if (!prev) return false;

		this.__chars -= prev.html.length;
		this.__redo.push(this.__snapshot());
		this.__restore(prev);
		this.__lastKind = null; // следующая печать начнёт новый шаг
		return true;
	}

	/** Повторить отменённый шаг. Возвращает false, если повторять нечего. */
	redo(): boolean {
		const next = this.__redo.pop();
		if (!next) return false;

		const current = this.__snapshot();
		this.__undo.push(current);
		this.__chars += current.html.length;
		this.__restore(next);
		this.__lastKind = null;
		return true;
	}

	private __restore(snap: Snapshot): void {
		this.__root.innerHTML = snap.html;

		// содержимое заменено целиком — выделение восстанавливаем, где бы оно ни стояло
		const sel = documentSelection(this.__root);
		if (sel) restoreSelection(this.__root, snap.start, snap.end, sel);
	}
}
