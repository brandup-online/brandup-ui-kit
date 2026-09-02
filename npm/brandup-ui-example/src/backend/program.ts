const express = require("express");
import { Application } from "express";
const path = require("path");
const { spawn } = require("child_process");
import ExampleServer from "./server";

const app: Application = express();
const server: ExampleServer = new ExampleServer(app, path.join(__dirname, "../wwwroot/dist"), {
	keyFile: path.join(__dirname, "../sslcert", "local.decrypted.key"),
	certFile: path.join(__dirname, "../sslcert", "local.crt"),
});

const PORT_ARG_PREFIX = "--port=";
const PORT_DEFAULT = 443;
const NO_OPEN_ARG = "--no-open";

function openBrowser(url: string) {
	const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

	try {
		// windowsHide: иначе `cmd /c start` моргает консольным окном поверх терминала
		const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
		child.on("error", () => console.log(`Open ${url} manually`));
		child.unref();
	} catch {
		console.log(`Open ${url} manually`);
	}
}

let port: number = PORT_DEFAULT;
process.argv.map((value) => {
	if (value.indexOf(PORT_ARG_PREFIX) !== 0) return;

	const parsed = parseInt(value.substring(PORT_ARG_PREFIX.length));
	if (!Number.isNaN(parsed)) port = parsed;
});
console.log(`run on port ${port}`);

if (!server.server) throw new Error("server creation error");

server.server
	.listen(port, () => {
		const url = `https://localhost:${port}`;
		console.log(`Server start ${url}`);

		if (!process.argv.includes(NO_OPEN_ARG)) openBrowser(url);
	})
	.on("error", (err: any) => {
		if (err.code === "EADDRINUSE") console.log("Error: address already in use");
		else console.log(err);
	});
