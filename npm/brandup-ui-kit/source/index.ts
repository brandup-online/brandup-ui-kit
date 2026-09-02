import { UiKitMiddleware } from "./middleware";
export * from "./popup";
export { UIKIT } from "./names";
export {
	computePosition,
	clippingRect,
	positionElement,
	clearPosition,
	trackPosition,
	type Placement,
	type Side,
	type Align,
	type Rect,
	type Size,
	type PositionOptions,
	type PositionResult,
	type TrackOptions,
} from "./position";
export { LayerManager, type Layer, type LayerOptions, type ILayerManager } from "./layer";

export { default as Modal, type ModalOptions } from "./modal";
export { IS_TOUCH_DEVICE, isCoarsePointer } from "./utils/compatibility";
export { hasUserScrolled, resetUserScroll } from "./utils/user-scroll";
// An import with an audible side effect: the module subscribes itself to cancelling the toggle on a
// choice control marked `readonly` (see readonly-choice). There is nothing to expose — the arming
// arrives with this import, and calling it earlier than that is not possible anyway.
import "./utils/readonly-choice";
export { textTag } from "./utils/text";
import "./styles.less";

export const uiKitMiddlewareFactory = () => new UiKitMiddleware();
