import { Router } from "express";
import ExampleContoller from "../controllers/example.contoller";

class ExampleRoutes {
	router = Router();
	controller = new ExampleContoller();

	constructor() {
		this.intializeRoutes();
	}

	intializeRoutes() {
		this.router.post("/_form/send", this.controller.formSend);
		this.router.post("/_form/redirect", this.controller.formRedirect);
		this.router.post("/_form/redirect-external", this.controller.formRedirectExternal);

		this.router.post("/_ajax/send-json", this.controller.sendJson);
		this.router.get("/_ajax/redirect", this.controller.redirect);
		this.router.get("/_ajax/json", this.controller.json);
		this.router.get("/_ajax/html", this.controller.html);
		this.router.get("/_ajax/text", this.controller.text);
		this.router.get("/_ajax/image", this.controller.image);
		this.router.get("/_ajax/delay", this.controller.delay);

		this.router.get("*", this.controller.spa);
	}
}

export default new ExampleRoutes().router;