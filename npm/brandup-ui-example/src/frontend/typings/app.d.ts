import { AjaxResponse } from "@brandup/ui-ajax";
import { ApplicationModel, ContextData } from "@brandup/ui-app";
import { LocaleNamespace } from "@brandup/ui-i18n";
import { AppLocaleModel } from "../i18n";

export interface ExampleApplicationModel extends ApplicationModel {
	/** Тексты примера на выбранном языке: строка берётся лямбдой — `texts.t(m => m.nav.home)`. */
	texts: LocaleNamespace<AppLocaleModel>;
}

export interface PageNavigationData extends ContextData {
	page?: Page;
	error?: boolean;
}

export interface PageSubmitData extends ContextData {
	page?: Page;
	response?: AjaxResponse;
}
