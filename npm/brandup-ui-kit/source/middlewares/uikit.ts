import { Application, Middleware, MiddlewareNext, NavigateContext } from "@brandup/ui-app";
import "../styles.less";

export default (): Middleware => {
	return {
		name: "uikit",
		navigate: (context: NavigateContext<Application>, next: MiddlewareNext) => {
			return next();
		}
	};
};