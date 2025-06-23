import { UiKitMiddleware } from "./middleware";
export * from "./popup"
export { IS_TOUCH_DEVICE } from "./utils/compatibility";
import "./styles.less";

export const uiKitMiddlewareFactory = () => new UiKitMiddleware();