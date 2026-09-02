import JSDOMEnvironment from "jest-environment-jsdom";

// https://github.com/facebook/jest/blob/v29.4.3/website/versioned_docs/version-29.4/Configuration.md#testenvironment-string
export default class FixJSDOMEnvironment extends JSDOMEnvironment {
	constructor(...args: ConstructorParameters<typeof JSDOMEnvironment>) {
		super(...args);

		// FIXME https://github.com/jsdom/jsdom/issues/1724
		this.global.fetch = fetch;
		this.global.Headers = Headers;
		this.global.Request = Request;
		this.global.Response = Response;
		this.global.FormData = FormData;
		// AbortController/AbortSignal only when jsdom has none of its own. Overwriting them
		// unconditionally, as this did, broke everything that hands a signal to a DOM listener:
		// `addEventListener(type, fn, { signal })` is checked by jsdom against *its* AbortSignal,
		// and a node one is refused with a TypeError. The dropdown does exactly that when it opens
		// its list, so the throw landed in the middle of opening — after the class was set, before
		// the layer and the listeners that close the list — and the suite went on testing a list
		// that only looked open.
		if (!this.global.AbortController) this.global.AbortController = AbortController;
		if (!this.global.AbortSignal) this.global.AbortSignal = AbortSignal;
	}
}
