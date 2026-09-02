// Generates a self-signed local dev certificate for the HTTPS server.
// Idempotent: skips while the existing cert is still valid. Cert is gitignored.
const fs = require("fs");
const path = require("path");
const nodeCrypto = require("node:crypto");
const selfsigned = require("selfsigned");

const dir = path.join(__dirname, "..", "sslcert");
const keyPath = path.join(dir, "local.decrypted.key");
const certPath = path.join(dir, "local.crt");

const SERVER_AUTH_OID = "1.3.6.1.5.5.7.3.1";
// Перевыпускаем заранее: сертификат, доживающий последние дни, посреди работы превращается
// в предупреждение браузера, и причина этого дальше всего от того, чем в тот момент заняты.
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

// Regenerate an expired cert, and one without extKeyUsage: browsers reject such a cert
// with ERR_CERT_INVALID, without even offering to continue.
function isCertUsable() {
	if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return false;

	try {
		const cert = new nodeCrypto.X509Certificate(fs.readFileSync(certPath));
		if (new Date(cert.validTo).getTime() - Date.now() <= RENEW_BEFORE_MS) return false;

		return Array.isArray(cert.keyUsage) && cert.keyUsage.includes(SERVER_AUTH_OID);
	} catch {
		return false;
	}
}

if (isCertUsable()) {
	console.log("dev cert already present at", dir);
	process.exit(0);
}

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// No `extensions` on purpose: the defaults of selfsigned carry basicConstraints,
// keyUsage, extKeyUsage and the SAN (localhost + 127.0.0.1) that browsers require.
selfsigned
	.generate([{ name: "commonName", value: "localhost" }], {
		algorithm: "sha256",
		keySize: 2048,
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
