/** Вариант темы: набор значений поверх основной, попадающий под свой селектор. */
export interface ThemeVariant {
	/** Селектор, под которым лежит вариант, например `:root[data-theme="dark"]`. */
	selector: string;
	/** Путь к файлу значений варианта. Дополняет основную тему, а не заменяет её. */
	theme: string;
}

export interface BuildThemeOptions {
	/** Путь к файлу темы (`uikit.vars.less`). */
	theme: string;
	/** less-файлы, чьи блоки `:root` образуют тему. По умолчанию — файлы кита. */
	entries?: string[];
	/** Дополнительные варианты — тёмная тема, оформление под клиента. */
	variants?: ThemeVariant[];
	/** Дополнительные каталоги для поиска импортов. */
	paths?: string[];
	/** Куда записать результат. Без него CSS только возвращается. */
	out?: string;
	/**
	 * Сюда складываются пути всех файлов, из которых собрана тема, — файл темы, входные файлы и
	 * все их импорты. Нужно тому, кто кеширует результат или следит за правками: тема собирается
	 * из десятка файлов кита, и по одному лишь файлу темы правка `vars.less` остаётся незамеченной.
	 */
	dependencies?: Set<string>;
	/** Экземпляр less. По умолчанию берётся из зависимостей кита. */
	less?: { render(source: string, options: object): Promise<{ css: string; imports?: string[] }> };
}

declare function buildTheme(options: BuildThemeOptions): Promise<string>;

declare namespace buildTheme {
	/** Достаёт содержимое блоков `:root` из скомпилированного CSS. */
	function extractRootBlocks(css: string): string[];

	/** Файлы кита, объявляющие токены: используются, когда `entries` не задан. */
	const DEFAULT_ENTRIES: string[];
}

export = buildTheme;
