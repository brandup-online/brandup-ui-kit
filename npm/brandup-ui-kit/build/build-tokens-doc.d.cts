/** Собирает справочник входов темы из `vars.less` и отдаёт его разметкой Markdown. */
export declare function render(): string;

/** То же, но записывает результат в `TOKENS.md` пакета; возвращает путь к файлу. */
export declare function build(): string;

/** Путь к `TOKENS.md` — тот же, в который пишет `build`. */
export declare const OUT_FILE: string;
