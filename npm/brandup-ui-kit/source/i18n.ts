/**
 * Default captions of the kit controls and the way an application replaces them.
 *
 * A separate entry (`@brandup/ui-kit/i18n`) with no imports and no side effects: every kit package
 * declares its captions through it, and the common entry of the kit would drag along the popup,
 * the modal window, the styles and `@brandup/ui-app`.
 *
 * Defaults shipped by the packages are English. A localized application registers its own strings
 * once at startup, before the controls are built:
 *
 * ```TypeScript
 * import { setTexts } from "@brandup/ui-kit/i18n";
 * import ru from "@brandup/ui-dropdown/locale/ru.json";
 *
 * setTexts({ dropdown: ru });
 * ```
 *
 * A caption of a single control is still set on the control itself (a `data-*` attribute or an
 * option), and that wins over the application texts. So the order is: the control, then
 * {@link setTexts}, then the default of the package.
 */

/**
 * Caption namespaces of the kit. Every package adds its own through declaration merging, which is
 * what gives {@link setTexts} its completion and its typo checking:
 *
 * ```TypeScript
 * declare module "@brandup/ui-kit/i18n" {
 *     interface KitTexts {
 *         dropdown: { PLACEHOLDER: string; EMPTY: string };
 *     }
 * }
 * ```
 */
export interface KitTexts {}

/** Application texts: any subset of the namespaces, and of the captions inside them. */
export type KitTextOverrides = { [K in keyof KitTexts]?: Partial<KitTexts[K]> };

// Kept by namespace name, not by the declared namespace object: an application registers its texts
// at startup, while the package that declares the namespace may be imported much later (a control
// of a page loaded on demand). An override for a namespace nobody declared simply stays unused.
//
// Without a prototype, both here and per namespace: a name that happens to belong to
// `Object.prototype` is an ordinary key this way. On a plain object `overrides["toString"]` would
// answer with the inherited function and the captions of that namespace would be written onto it,
// and `overrides["__proto__"] = {}` would set the prototype instead of storing anything.
const overrides: { [ns: string]: { [key: string]: string } | undefined } = Object.create(null);

/**
 * Declares the captions of a package and returns them as a live object: every read consults the
 * application texts first and falls back to the default.
 *
 * The result is frozen, so a caption cannot be assigned over by accident. Read it where the markup
 * is built, not at module load, otherwise {@link setTexts} called later has nothing to affect.
 */
export function declareTexts<K extends keyof KitTexts>(ns: K, defaults: KitTexts[K]): KitTexts[K] {
	const texts: { [key: string]: string } = {};
	const values = defaults as { [key: string]: string };

	for (const key of Object.keys(values)) {
		Object.defineProperty(texts, key, {
			enumerable: true,
			get: () => overrides[ns as string]?.[key] ?? values[key],
		});
	}

	return Object.freeze(texts) as KitTexts[K];
}

/**
 * Registers application captions. Merges over what was registered before, so a later call only
 * has to carry what it changes.
 *
 * A caption given as `undefined` is skipped rather than reset: an object built by spreading a
 * dictionary must not blank out the defaults of the keys it does not mention. Use
 * {@link resetTexts} to go back to the defaults.
 */
export function setTexts(texts: KitTextOverrides): void {
	for (const [ns, captions] of Object.entries(texts as { [ns: string]: { [key: string]: string } | undefined })) {
		if (!captions) continue;

		const current = (overrides[ns] ??= Object.create(null));
		for (const [key, value] of Object.entries(captions)) {
			if (value !== undefined) current[key] = value;
		}
	}
}

/** Drops the application captions, of one namespace or of all of them, back to the package defaults. */
export function resetTexts(ns?: keyof KitTexts): void {
	if (ns === undefined) {
		for (const key of Object.keys(overrides)) delete overrides[key];
		return;
	}

	delete overrides[ns as string];
}
