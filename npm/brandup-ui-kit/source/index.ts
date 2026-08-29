import { UiKitMiddleware } from "./middleware";
export * from "./popup";
export { UIKIT } from "./names";
export { LayerManager, type Layer, type LayerOptions, type ILayerManager } from "./layer";

export { default as Modal, type ModalOptions } from "./modal";
export { IS_TOUCH_DEVICE, isCoarsePointer } from "./utils/compatibility";
export { hasUserScrolled, resetUserScroll } from "./utils/user-scroll";
export { enforceReadonlyChoice } from "./utils/readonly-choice";
export { textTag } from "./utils/text";
import "./styles.less";

export const uiKitMiddlewareFactory = () => new UiKitMiddleware();
