import { DOM, type ElementOptions } from "@brandup/ui";

/**
 * Creates an element holding `text` as text, never as markup.
 *
 * A string child of `DOM.tag` is inserted as HTML — that is how svg icons reach buttons. Anything
 * coming from the user or from the host markup (message text, variable names and keys, window
 * titles) must go through here instead: otherwise an `<img onerror>` typed into a field would
 * execute once it is shown back.
 */
export function textTag<T extends keyof HTMLElementTagNameMap>(
	tagName: T,
	options: ElementOptions | null,
	text: string
): HTMLElementTagNameMap[T] {
	const elem = DOM.tag(tagName, options);
	elem.textContent = text;

	return elem;
}
