// Разметку страницы примера webpack вкладывает в бандл строкой (`type: "asset/source"`).
// Под jest импорт `.html` иначе разбирался бы как модуль — здесь он становится той же строкой,
// и страницу примера можно отрендерить в тесте ровно так, как она рендерится в браузере.
module.exports = {
	process(sourceText) {
		return { code: `module.exports = ${JSON.stringify(sourceText)};` };
	},
};
