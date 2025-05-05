import { UiKitMiddleware } from "./middleware";
export * from "./popup"
import "./styles.less";

export const uiKitMiddlewareFactory = () => new UiKitMiddleware();