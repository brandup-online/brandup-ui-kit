import { AjaxResponse } from "@brandup/ui-ajax";
import { ApplicationModel, ContextData } from "@brandup/ui-app";

export interface ExampleApplicationModel extends ApplicationModel {

}

export interface PageNavigationData extends ContextData {
	page?: Page;
	error?: boolean;
}

export interface PageSubmitData extends ContextData {
	page?: Page;
	response?: AjaxResponse;
}