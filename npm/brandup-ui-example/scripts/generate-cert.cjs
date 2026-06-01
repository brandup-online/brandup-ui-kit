// Generates a self-signed local dev certificate for the HTTPS server.
// Idempotent: skips when both files already exist. Cert is gitignored.
const fs = require("fs");
const path = require("path");
const selfsigned = require("selfsigned");

const dir = path.join(__dirname, "..", "sslcert");
const keyPath = path.join(dir, "local.decrypted.key");
const certPath = path.join(dir, "local.crt");

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
	console.log("dev cert already present at", dir);
	process.exit(0);
}

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

selfsigned
	.generate([{ name: "commonName", value: "localhost" }], {
		days: 3650,
		keySize: 2048,
		extensions: [
			{
				name: "subjectAltName",
				altNames: [
					{ type: 2, value: "localhost" },
					{ type: 7, ip: "127.0.0.1" },
				],
			},
		],
	})
	.then((pems) => {
		fs.writeFileSync(keyPath, pems.private);
		fs.writeFileSync(certPath, pems.cert);
		console.log("generated dev cert at", dir);
	})
	.catch((err) => {
		console.error("failed to generate dev cert:", err);
		process.exit(1);
	});
