import { DOM, UIElement } from "@brandup/ui";
import { AjaxQueue } from "@brandup/ui-ajax";
import type { AjaxResponse } from "@brandup/ui-ajax";
import { ExampleApplication } from "../app";
import type { PageNavigationData, PageSubmitData } from "../typings/app";
import type { NavigateContext, SubmitContext } from "@brandup/ui-app";
import "./base.less";

export abstract class Page extends UIElement {
	readonly app: ExampleApplication;
	private __context: NavigateContext<ExampleApplication, PageNavigationData>;
	readonly ajax: AjaxQueue;

	get context() {
		return this.__context;
	}

	constructor(context: NavigateContext<ExampleApplication, PageNavigationData>) {
		super();

		this.app = context.app;
		this.__context = context;
		this.ajax = new AjaxQueue();

		this.__context.data.page = this;
	}

	async render(): Promise<DocumentFragment> {
		const content = document.createDocumentFragment();
		const pageElem = DOM.tag("div", { class: "page" });
		content.appendChild(pageElem);

		this.setElement(pageElem);

		await this.onRenderContent(pageElem);

		return content;
	}

	protected override _onRenderElement(element: HTMLElement) {
		element.appendChild(DOM.tag("header", { class: "page-header" }, [DOM.tag("h1", null, this.header)]));
	}

	/** @internal */
	async __changedHash(
		context: NavigateContext<ExampleApplication, PageNavigationData>,
		newHash: string | null,
		oldHash: string | null
	) {
		if (!this.element) return;

		this.__context = context;

		await this.onChangedHash(newHash, oldHash);
	}

	formSubmitted(response: AjaxResponse, context: SubmitContext<ExampleApplication, PageSubmitData>) {
		console.log(response);

		return this.onFormSubmitted(response, context);
	}

	abstract get header(): string;
	protected abstract onRenderContent(container: HTMLElement): Promise<void>;
	protected onChangedHash(_newHash: string | null, _oldHash: string | null): Promise<void> {
		return Promise.resolve();
	}
	protected async onFormSubmitted(
		_response: AjaxResponse,
		_context: SubmitContext<ExampleApplication, PageSubmitData>
	) {}

	override destroy() {
		this.ajax.destroy();
		this.element?.remove();

		super.destroy();
	}
}
