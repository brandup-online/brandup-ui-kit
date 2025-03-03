const path = require("path");
import { Request, Response } from "express";
import { distDir } from "..";

export default class ExampleContoller {
	spa(_req: Request, res: Response): void {
		return res.sendFile(path.join("index.html"), { root: distDir });
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