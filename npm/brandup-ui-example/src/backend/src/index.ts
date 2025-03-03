const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");
const fs = require("fs");

import { Application } from "express";
import { CorsOptions } from "cors";
import { Server } from "https";
import Routes from "./routes/index";

export const distDir = path.join(__dirname, "../../../wwwroot/dist");

export default class ExampleServer {
	private __server: Server | undefined;
	get server() { return this.__server };

	constructor(app: Application) {
		this.config(app);
		new Routes(app);
	}

	private config(app: Application): void {
		const corsOptions: CorsOptions = {
			origin: "*"
		};

		app.use(cors(corsOptions));
		app.use(express.json());
		app.use(express.urlencoded({ extended: true }));

		app.use(express.static(distDir));

		const privateKey = fs.readFileSync(path.join(__dirname, "../sslcert", "local.decrypted.key"), "utf8");
		const certificate = fs.readFileSync(path.join(__dirname, "../sslcert", "local.crt"), "utf8");
		const credentials = { key: privateKey, cert: certificate };
		this.__server = https.createServer(credentials, app);
	}
}