import fs from "node:fs";
import { render, OUT_FILE } from "../build/build-tokens-doc.cjs";

// Справочник входов лежит в репозитории готовым файлом — его читают на GitHub и в пакете, где
// генератор запускать негде. Значит, он способен разойтись с `vars.less`: переименовали вход,
// добавили токен, поправили комментарий — таблица осталась прежней. Этот тест и есть то, что
// не даёт им разойтись: расхождение видно на сборке, а не читателю документации.

test("TOKENS.md совпадает с тем, что собирается из vars.less", () => {
	const committed = fs.readFileSync(OUT_FILE, "utf-8").replace(/\r\n/g, "\n");

	expect(committed).toBe(render());
});
