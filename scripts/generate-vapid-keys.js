const { generateKeyPairSync } = require("crypto");

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error("Falha ao gerar chaves VAPID.");
}

const vapidPublicKey = toBase64Url(Buffer.concat([
  Buffer.from([0x04]),
  fromBase64Url(publicJwk.x),
  fromBase64Url(publicJwk.y),
]));
const vapidPrivateKey = toBase64Url(fromBase64Url(privateJwk.d));

console.log("VAPID_PUBLIC_KEY=" + vapidPublicKey);
console.log("VAPID_PRIVATE_KEY=" + vapidPrivateKey);
console.log("VAPID_SUBJECT=mailto:admin@obra-conectada.local");

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
