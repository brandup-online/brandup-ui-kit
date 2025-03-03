import { Middleware, MiddlewareNext, NavigateContext } from "@brandup/ui-app";
import { ExampleApplication } from "../app";
import { PageNavigationData } from "../typings/app";

const ErrorMiddlewareFactory = (): Middleware => {
	return {
		name: "error",
		navigate: async (context: NavigateContext<ExampleApplication, PageNavigationData>, next: MiddlewareNext) => {
			await next();
		}
	};
};

export default ErrorMiddlewareFactory;