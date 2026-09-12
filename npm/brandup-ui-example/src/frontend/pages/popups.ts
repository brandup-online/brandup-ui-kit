import { Page } from "./base";
import { pickContent } from "../i18n";
import "./popups.less";
import { PopupManager, type Placement } from "@brandup/ui-kit";

export default class PopupsPage extends Page {
	get typeName(): string {
		return "PopupsPage";
	}
	get header(): string {
		return this.app.model.texts.t((m) => m.pages.popups);
	}

	protected async onRenderContent(container: HTMLElement) {
		container.insertAdjacentHTML(
			"beforeend",
			await pickContent({ ru: () => import("./popups.html"), en: () => import("./popups.en.html") })
		);

		this.registerCommand("open", (context) => {
			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, { initiator: context.target });
		});

		// There are no coordinates in the stylesheet at all — the kit works them out. The side and
		// the alignment come from the button itself: `bottom-start` by default, and `bottom-end` for
		// the button at the right edge of the block, whose popup is wider than it is and would
		// otherwise hang out past it.
		//
		// `flipAlign` and `fallback` are both switched on here to show them working. Neither is on
		// by default, and neither replaces the explicit `bottom-end` above: they answer to the edge
		// of the screen, so they come into play once the window is narrow or short enough for the
		// button to actually be near it.
		this.registerCommand("anchored", (context) => {
			const placement = context.target.dataset.placement as Placement | undefined;

			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, {
				initiator: context.target,
				position: { placement, flipAlign: true, fallback: "bestFit" },
			});
		});

		// The submenu opens sideways: its button stands inside an already open popup, so the parent
		// stays rather than closing.
		this.registerCommand("anchored-right", (context) => {
			PopupManager.toggle(context.target.nextElementSibling as HTMLElement, {
				initiator: context.target,
				position: { placement: "right-start", gap: 8 },
			});
		});
	}
}
