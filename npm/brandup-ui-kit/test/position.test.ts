/**
 * @jest-environment jsdom
 */
import { computePosition, type PositionOptions, type Rect } from "../source/position";

// Расчёт отделён от DOM ради этого набора: jsdom не считает раскладку, все размеры в нём нулевые,
// и проверить «не влезает вниз — переворачивайся» на настоящих элементах было бы нечем. Здесь
// прямоугольники задаются числами, поэтому проверяются именно углы, а не то, что попап где-то
// оказался.

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 200, height: 100 };

/** Якорь 100×20 в указанной точке — кнопка, у которой раскрывают попап. */
const anchorAt = (left: number, top: number, width = 100, height = 20): Rect => ({ left, top, width, height });

const at = (anchor: Rect, options: PositionOptions = {}, size = SIZE, viewport = VIEWPORT) =>
	computePosition(anchor, size, viewport, options);

describe("computePosition: сторона и выравнивание", () => {
	it("по умолчанию встаёт под якорем по его левому краю", () => {
		const result = at(anchorAt(300, 300));

		expect(result).toEqual({ left: 300, top: 324, placement: "bottom-start" });
	});

	it("зазор отделяет от якоря, а не накладывает на него", () => {
		expect(at(anchorAt(300, 300), { gap: 12 }).top).toBe(332);
	});

	it("выравнивание по концу прижимает к правому краю якоря", () => {
		// якорь 100 шириной, попап 200: правые края совпадают, значит левый уходит на 100 левее
		expect(at(anchorAt(300, 300), { placement: "bottom-end" }).left).toBe(200);
	});

	it("выравнивание по центру ставит середину под серединой", () => {
		expect(at(anchorAt(300, 300), { placement: "bottom-center" }).left).toBe(250);
	});

	it("сторона top ставит над якорем", () => {
		expect(at(anchorAt(300, 300), { placement: "top-start" })).toEqual({
			left: 300,
			top: 196,
			placement: "top-start",
		});
	});

	it("сторона right ставит справа и выравнивает по верху", () => {
		expect(at(anchorAt(300, 300), { placement: "right-start" })).toEqual({
			left: 404,
			top: 300,
			placement: "right-start",
		});
	});

	it("сторона left ставит слева", () => {
		expect(at(anchorAt(300, 300), { placement: "left-start" }).left).toBe(96);
	});
});

describe("computePosition: переворот", () => {
	// Кнопка у нижнего края: под ней места нет, над ней есть — попап уходит наверх.
	it("не влезая вниз, переворачивается вверх", () => {
		const result = at(anchorAt(300, 760));

		expect(result.placement).toBe("top-start");
		expect(result.top).toBe(656); // 760 - 100 - 4
	});

	it("не влезая вверх, переворачивается вниз", () => {
		const result = at(anchorAt(300, 10), { placement: "top-start" });

		expect(result.placement).toBe("bottom-start");
		expect(result.top).toBe(34);
	});

	it("не влезая вправо, переворачивается влево", () => {
		const result = at(anchorAt(900, 300), { placement: "right-start" });

		expect(result.placement).toBe("left-start");
		expect(result.left).toBe(696); // 900 - 200 - 4
	});

	// Низкий экран: не помещается ни там, ни там. Тогда остаёмся на запрошенной стороне —
	// там попап ожидаем, а к краю его прижмёт сдвиг.
	it("не помещаясь ни на одной стороне, остаётся на запрошенной", () => {
		const result = at(anchorAt(300, 100), { placement: "bottom-start" }, SIZE, { width: 1000, height: 220 });

		expect(result.placement).toBe("bottom-start");
	});

	it("переворот отключается", () => {
		const result = at(anchorAt(300, 760), { flip: false });

		expect(result.placement).toBe("bottom-start");
		expect(result.top).toBe(784);
	});
});

describe("computePosition: сдвиг вдоль стороны", () => {
	// Кнопка у правого края: попап по её левому краю вылез бы за экран.
	it("прижимается к правому краю, не выходя за него", () => {
		const result = at(anchorAt(900, 300));

		expect(result.left).toBe(792); // 1000 - 8 - 200
	});

	it("прижимается к левому краю", () => {
		expect(at(anchorAt(-40, 300)).left).toBe(8);
	});

	it("не сдвигает то, что и так помещается", () => {
		expect(at(anchorAt(300, 300)).left).toBe(300);
	});

	// Попап шире экрана: прижать его к обоим краям нельзя, поэтому показываем начало —
	// уехавшее в минус левое ребро спрятало бы первую строку списка.
	it("элемент шире экрана показывает своё начало", () => {
		const result = at(anchorAt(300, 300), {}, { width: 1200, height: 100 });

		expect(result.left).toBe(8);
	});

	it("на боковой стороне сдвигает по вертикали, а не по горизонтали", () => {
		const result = at(anchorAt(300, 760), { placement: "right-start" });

		expect(result.left).toBe(404); // прижат к якорю — поперёк не двигаем
		expect(result.top).toBe(692); // 800 - 8 - 100
	});

	it("сдвиг отключается", () => {
		expect(at(anchorAt(900, 300), { shift: false }).left).toBe(900);
	});

	it("отступ от края настраивается", () => {
		expect(at(anchorAt(900, 300), { viewportPadding: 24 }).left).toBe(776);
	});
});

describe("computePosition: переворот и сдвиг вместе", () => {
	// Угол экрана: не влезает ни вниз, ни вправо — должно сработать и то, и другое.
	it("в нижнем правом углу переворачивается и прижимается", () => {
		const result = at(anchorAt(940, 770));

		expect(result.placement).toBe("top-start");
		expect(result.top).toBe(666); // 770 - 100 - 4
		expect(result.left).toBe(792); // 1000 - 8 - 200
	});

	// Сторону выбираем до сдвига: сдвиг вдоль неё на то, помещается ли попап поперёк, не влияет,
	// а вот выбранная сторона задаёт, вдоль чего сдвигать.
	it("сдвиг не отменяет уже выбранной стороны", () => {
		const result = at(anchorAt(-40, 760));

		expect(result.placement).toBe("top-start");
		expect(result.left).toBe(8);
	});
});
