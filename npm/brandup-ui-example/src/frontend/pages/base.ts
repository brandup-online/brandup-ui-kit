import { UIElement } from "@brandup/ui";
import { AjaxQueue, AjaxResponse } from "@brandup/ui-ajax";
import { DOM } from "@brandup/ui-dom";
import { ExampleApplication } from "../app";
import { PageNavigationData, PageSubmitData } from "frontend/typings/app";
import { NavigateContext, SubmitContext } from "@brandup/ui-app";

export abstract class Page extends UIElement {
	readonly app: ExampleApplication;
	private __context: NavigateContext<ExampleApplication, PageNavigationData>;
	readonly ajax: AjaxQueue;
	private __hash: string | null;

	get context() { return this.__context; }

	constructor(context: NavigateContext<ExampleApplication, PageNavigationData>) {
		super();

		this.app = context.app;
		this.__context = context;
		this.ajax = new AjaxQueue();

		this.__context.data.page = this;
		this.__hash = context.hash;
	}

	async render(): Promise<DocumentFragment> {
		const content = document.createDocumentFragment();
		const pageElem = DOM.tag("div", "page");
		content.appendChild(pageElem);

		this.setElement(pageElem);

		await this.onRenderContent(pageElem);

		return content;
	}

	protected _onRenderElement(element: HTMLElement) {
		element.appendChild(DOM.tag("header", "page-header", [
			DOM.tag("h1", null, this.header)
		]));
	}

	/** @internal */
	async __changedHash(context: NavigateContext<ExampleApplication, PageNavigationData>, newHash: string | null, oldHash: string | null) {
		if (!this.element)
			return;

		this.__context = context;

		if (newHash)
			this.__hash = newHash;
		else
			this.__hash = null;

		await this.onChangedHash(newHash, oldHash);
	}

	formSubmitted(response: AjaxResponse, context: SubmitContext<ExampleApplication, PageSubmitData>) {
		console.log(response);

		return this.onFormSubmitted(response, context);
	}

	abstract get header(): string;
	protected abstract onRenderContent(container: HTMLElement): Promise<void>;
	protected onChangedHash(_newHash: string | null, _oldHash: string | null): Promise<void> { return Promise.resolve(); }
	protected async onFormSubmitted(response: AjaxResponse, context: SubmitContext<ExampleApplication, PageSubmitData>) { }

	destroy() {
		this.ajax.destroy();
		this.element?.remove();

		super.destroy();
	}
}