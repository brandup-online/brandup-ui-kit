const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");
const fs = require("fs");

import { Application } from "express";
import { CorsOptions } from "cors";
import { Server } from "https";
import Routes from "./routes";

export default class ExampleServer {
	private __server: Server | undefined;
	get server() { return this.__server };

	constructor(app: Application, staticDir: string, ssl: { keyFile: string, certFile: string }) {
		this.config(app, staticDir, ssl);

		Routes(app);
	}

	private config(app: Application, staticDir: string, ssl: { keyFile: string, certFile: string }): void {
		app.set("wwwroot", staticDir);

		const corsOptions: CorsOptions = {
			origin: "*"
		};

		app.use(cors(corsOptions));
		app.use(express.json());
		app.use(express.urlencoded({ extended: true }));
		app.use(express.static(staticDir));

		const privateKey = fs.readFileSync(ssl.keyFile, "utf8");
		const certificate = fs.readFileSync(ssl.certFile, "utf8");
		const credentials = { key: privateKey, cert: certificate };
		this.__server = https.createServer(credentials, app);
	}
}