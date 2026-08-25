/**
 * Читает файл темы (`uikit.vars.less`) и отдаёт его переменные в виде, который ждёт `modifyVars`
 * less-loader'а: `{ "@font-size": "14px" }`.
 *
 * Путь по умолчанию — `uikit.vars.less` относительно текущего каталога сборки.
 */
declare function parseLessVars(filePath?: string): Record<string, string>;

export = parseLessVars;
