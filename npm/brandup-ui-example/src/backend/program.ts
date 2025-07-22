const express = require("express");
import { Application } from "express";
const path = require("path");
import ExampleServer from "./server";

const app: Application = express();
const server: ExampleServer = new ExampleServer(
	app,
	path.join(__dirname, "../wwwroot/dist"),
	{
		keyFile: path.join(__dirname, "../sslcert", "local.decrypted.key"),
		certFile: path.join(__dirname, "../sslcert", "local.crt")
	});

const PORT_ARG_PREFIX = "--port=";
const PORT_DEFAULT = 443;

let port: number = PORT_DEFAULT;
process.argv.map(value => {
	if (value.indexOf(PORT_ARG_PREFIX) !== 0)
		return;

	port = parseInt(value.substring(PORT_ARG_PREFIX.length)) ?? PORT_DEFAULT;
});
console.log(`run on port ${port}`);

if (!server.server)
	throw new Error("server creation error");

server.server.listen(port, () => { console.log(`Server start https://localhost:${port}`); })
	.on("error", (err: any) => {
		if (err.code === "EADDRINUSE")
			console.log("Error: address already in use");
		else
			console.log(err);
	});