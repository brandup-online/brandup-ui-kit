const path = require("path");
import { Request, Response } from "express";

export default class ExampleContoller {
	spa(req: Request, res: Response): void {
		return res.sendFile(path.join("index.html"), { root: req.app.get("wwwroot") });
	}

	formSend(_req: Request, res: Response): void {
		res.json({ name: "test" });
	}

	formRedirect(_req: Request, res: Response): void {
		res.redirect("/");
	}

	formRedirectExternal(_req: Request, res: Response): void {
		res.redirect("https://ya.ru");
	}

	sendJson(_req: Request, res: Response): void {
		res.json({ name: "test" });
	}

	redirect(_req: Request, res: Response): void {
		res.redirect("/forms");
	}

	json(_req: Request, res: Response): void {
		res.json({ name: "test" });
	}

	html(_req: Request, res: Response): void {
		res.type("html").send("<html></html>");
	}

	text(_req: Request, res: Response): void {
		res.type("text").send("hello");
	}

	image(_req: Request, res: Response): void {
		res.type("png").send("hello");
	}

	delay(_req: Request, res: Response, next: VoidFunction): void {
		setTimeout(() => {
			res.type("text").send("hello");
		}, 5000);
	}
}