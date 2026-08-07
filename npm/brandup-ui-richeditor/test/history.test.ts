/**
 * @jest-environment jsdom
 */
// История undo/redo как отдельный класс: бюджет памяти и устойчивость учёта объёма.
import { EditorHistory } from "../source/history";

function makeRoot(html = ""): HTMLElement {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	root.contentEditable = "true";
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

describe("EditorHistory budget", () => {
	// глубина ограничена: старые шаги отбрасываются, а не копятся без предела
	it("caps the undo depth", () => {
		const root = makeRoot("<p>0</p>");
		const history = new EditorHistory(root);

		for (let i = 1; i <= 105; i++) {
			history.record("op");
			root.innerHTML = `<p>${i}</p>`;
		}

		let undos = 0;
		while (history.undo()) undos++;
		expect(undos).toBeLessThanOrEqual(100); // MAX_DEPTH
		expect(undos).toBeGreaterThan(90);
	});

	// Учёт объёма не расползается на циклах undo/redo: повторные полные проходы дают
	// одинаковые счёты шагов, а не «съедающийся» стек (см. __chars/__redoChars).
	it("keeps undo/redo counts stable over full cycles", () => {
		const root = makeRoot("<p>0</p>");
		const history = new EditorHistory(root);

		for (let i = 1; i <= 20; i++) {
			history.record("op");
			root.innerHTML = `<p>шаг ${i}</p>`;
		}

		const counts: number[][] = [];
		for (let cycle = 0; cycle < 3; cycle++) {
			let undos = 0;
			while (history.undo()) undos++;
			let redos = 0;
			while (history.redo()) redos++;
			counts.push([undos, redos]);
		}

		expect(counts[1]).toEqual(counts[0]);
		expect(counts[2]).toEqual(counts[0]);
		expect(counts[0][0]).toBe(counts[0][1]); // сколько отменили — столько и повторили
		expect(root.innerHTML).toBe("<p>шаг 20</p>"); // циклы не потеряли содержимое
	});
});
