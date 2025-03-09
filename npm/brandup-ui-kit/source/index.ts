import { Middleware } from "@brandup/ui-app";
import "./styles.less";

export const uiKitMiddlewareFactory = (): Middleware => {
	return {
		name: "uikit"
	};
};