import { UiKitMiddleware } from "./middleware";
export * from "./popup";

/**
 * Прокручиваемая область с оформленной полосой (см. `.ui-scrollable` в common.less).
 * Размер и цвет переопределяются переменными `--scrollbar-*` на самом элементе.
 */
export const SCROLLABLE_CLASS = "ui-scrollable";

export { default as Modal, MODAL_CLASS, MODAL_OPENED_CLASS, MODAL_CLOSE_COMMAND, type ModalOptions } from "./modal";
export { IS_TOUCH_DEVICE } from "./utils/compatibility";
import "./styles.less";

export const uiKitMiddlewareFactory = () => new UiKitMiddleware();
