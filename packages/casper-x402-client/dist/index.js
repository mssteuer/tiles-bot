var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/types.ts
var CASPER_MAINNET_DOMAIN = {
  name: "WrappedCSPR",
  version: "1",
  chainId: 1514,
  verifyingContract: "0x0000000000000000000000000000000000000000"
  // placeholder, set per-deployment
};
var CASPER_TESTNET_DOMAIN = {
  name: "WrappedCSPR",
  version: "1",
  chainId: 1515,
  verifyingContract: "0x0000000000000000000000000000000000000000"
  // placeholder, set per-deployment
};

// src/signer.ts
import { blake2b } from "@noble/hashes/blake2b";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function computeAccountHash(algoPrefix, rawPublicKeyHex) {
  const algoByte = algoPrefix === "01" ? 1 : 2;
  const rawKeyBytes = fromHex(rawPublicKeyHex);
  const input = new Uint8Array(1 + rawKeyBytes.length);
  input[0] = algoByte;
  input.set(rawKeyBytes, 1);
  const hash = blake2b(input, { dkLen: 32 });
  return "0x" + toHex(hash);
}
function createCasperSigner(privateKeyHex, algorithm = "ed25519") {
  const clean = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const privKeyBytes = fromHex(clean);
  let rawPublicKeyHex;
  let algoPrefix;
  if (algorithm === "ed25519") {
    const pubKey = ed25519.getPublicKey(privKeyBytes);
    rawPublicKeyHex = toHex(pubKey);
    algoPrefix = "01";
  } else {
    const pubKey = secp256k1.getPublicKey(privKeyBytes, true);
    rawPublicKeyHex = toHex(pubKey);
    algoPrefix = "02";
  }
  const publicKeyHex = algoPrefix + rawPublicKeyHex;
  const accountHash = computeAccountHash(algoPrefix, rawPublicKeyHex);
  return {
    algorithm,
    publicKeyHex,
    accountHash,
    async sign(digest) {
      if (algorithm === "ed25519") {
        return ed25519.sign(digest, privKeyBytes);
      } else {
        const sig = secp256k1.sign(digest, privKeyBytes);
        const r = sig.r.toString(16).padStart(64, "0");
        const s = sig.s.toString(16).padStart(64, "0");
        const v = sig.recovery === 0 ? "1b" : "1c";
        return fromHex(r + s + v);
      }
    }
  };
}

// src/client.ts
import {
  hashTypedData,
  TransferAuthorizationTypes
} from "@casper-ecosystem/casper-eip-712";
function randomNonce() {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const { randomFillSync } = __require("crypto");
    randomFillSync(bytes);
  }
  return "0x" + toHex(bytes);
}
function buildTransferAuthorization(signer, requirements, timeoutSeconds) {
  const now = Math.floor(Date.now() / 1e3);
  const timeout = timeoutSeconds ?? requirements.maxTimeoutSeconds ?? 300;
  let toAccountHash;
  if (requirements.payTo.startsWith("0x") && requirements.payTo.length === 66) {
    toAccountHash = requirements.payTo;
  } else {
    const prefix = requirements.payTo.slice(0, 2);
    const rawKey = requirements.payTo.slice(2);
    toAccountHash = computeAccountHash(prefix, rawKey);
  }
  return {
    from: signer.accountHash,
    to: toAccountHash,
    value: requirements.maxAmountRequired,
    valid_after: BigInt(now),
    valid_before: BigInt(now + timeout),
    nonce: randomNonce()
  };
}
async function signTransferAuthorization(signer, domain, message) {
  const digest = hashTypedData(
    domain,
    TransferAuthorizationTypes,
    "TransferAuthorization",
    message
  );
  const sigBytes = await signer.sign(digest);
  return "0x" + toHex(sigBytes);
}
async function createCasperPaymentHeader(signer, requirements, domain) {
  const authorization = buildTransferAuthorization(signer, requirements);
  const signature = await signTransferAuthorization(signer, domain, authorization);
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: requirements.network,
    payload: {
      signature,
      authorization
    }
  };
  const json = JSON.stringify(
    payload,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  );
  return btoa(json);
}
function selectCasperPaymentRequirements(responseBody, network = "casper:casper") {
  const requirements = Array.isArray(responseBody) ? responseBody : responseBody.paymentRequirements ?? [];
  return requirements.find((r) => r.network === network) ?? null;
}
export {
  CASPER_MAINNET_DOMAIN,
  CASPER_TESTNET_DOMAIN,
  buildTransferAuthorization,
  computeAccountHash,
  createCasperPaymentHeader,
  createCasperSigner,
  fromHex,
  selectCasperPaymentRequirements,
  signTransferAuthorization,
  toHex
};
//# sourceMappingURL=index.js.map