import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { blake2b } from '@noble/hashes/blake2b';
import { ethers } from 'ethers';

// We test the standalone verification functions that don't need viem/RPC
import {
  detectAddressChain,
  verifyCasperSignature,
  verifyEvmEoaSignature,
} from '../src/lib/verify-wallet-sig.js';

// — Test Helpers

function casperSign(message, privKey, algo = 'ed25519') {
  const msgBytes = new TextEncoder().encode(message);
  const hash = blake2b(msgBytes, { dkLen: 32 });
  if (algo === 'ed25519') {
    const sig = ed25519.sign(hash, privKey);
    // Casper prefixes sig with algo byte: 01 for ed25519
    return '01' + Buffer.from(sig).toString('hex');
  } else {
    const sigObj = secp256k1.sign(hash, privKey);
    // Casper prefixes sig with algo byte: 02 for secp256k1
    return '02' + sigObj.toCompactHex();
  }
}

function makeEd25519Keys() {
  const privKey = ed25519.utils.randomPrivateKey();
  const pubKey = ed25519.getPublicKey(privKey);
  const address = '01' + Buffer.from(pubKey).toString('hex');
  return { privKey, pubKey, address };
}

function makeSecp256k1Keys() {
  const privKey = secp256k1.utils.randomPrivateKey();
  const pubKey = secp256k1.getPublicKey(privKey, true); // compressed
  const address = '02' + Buffer.from(pubKey).toString('hex');
  return { privKey, pubKey, address };
}

// — detectAddressChain

describe('detectAddressChain', () => {
  it('detects EVM address (0x + 40 hex)', () => {
    assert.equal(detectAddressChain('0x67439832C52C92B5ba8DE28a202E72D09CCEB42f'), 'evm');
  });

  it('detects EVM address (lowercase)', () => {
    assert.equal(detectAddressChain('0x67439832c52c92b5ba8de28a202e72d09cceb42f'), 'evm');
  });

  it('detects Casper ed25519 address (01 + 64 hex)', () => {
    const { address } = makeEd25519Keys();
    assert.equal(detectAddressChain(address), 'casper');
  });

  it('detects Casper secp256k1 address (02 + 66 hex)', () => {
    const { address } = makeSecp256k1Keys();
    assert.equal(detectAddressChain(address), 'casper');
  });

  it('returns null for invalid addresses', () => {
    assert.equal(detectAddressChain('not-an-address'), null);
    assert.equal(detectAddressChain(''), null);
    assert.equal(detectAddressChain('0x123'), null);
    assert.equal(detectAddressChain('03abcdef'), null);
  });
});

// — verifyCasperSignature (ed25519)

describe('verifyCasperSignature - ed25519', () => {
  it('verifies a valid ed25519 signature', () => {
    const { privKey, address } = makeEd25519Keys();
    const message = 'tiles.bot:metadata:42:1716700000';
    const signature = casperSign(message, privKey, 'ed25519');
    assert.equal(verifyCasperSignature(message, signature, address), true);
  });

  it('rejects signature for wrong message', () => {
    const { privKey, address } = makeEd25519Keys();
    const signature = casperSign('original message', privKey, 'ed25519');
    assert.equal(verifyCasperSignature('different message', signature, address), false);
  });

  it('rejects signature from wrong key', () => {
    const { address } = makeEd25519Keys();
    const other = makeEd25519Keys();
    const message = 'tiles.bot:metadata:42:1716700000';
    const signature = casperSign(message, other.privKey, 'ed25519');
    assert.equal(verifyCasperSignature(message, signature, address), false);
  });

  it('rejects corrupted signature', () => {
    const { privKey, address } = makeEd25519Keys();
    const message = 'tiles.bot:metadata:42:1716700000';
    let signature = casperSign(message, privKey, 'ed25519');
    // Corrupt 1 byte — flip bits so the replacement always differs from original
    const orig = signature.slice(20, 22);
    const flipped = (parseInt(orig, 16) ^ 0x01).toString(16).padStart(2, '0');
    signature = signature.slice(0, 20) + flipped + signature.slice(22);
    assert.equal(verifyCasperSignature(message, signature, address), false);
  });
});

// — verifyCasperSignature (secp256k1)

describe('verifyCasperSignature - secp256k1', () => {
  it('verifies a valid secp256k1 signature', () => {
    const { privKey, address } = makeSecp256k1Keys();
    const message = 'tiles.bot:heartbeat:100:1716700000';
    const signature = casperSign(message, privKey, 'secp256k1');
    assert.equal(verifyCasperSignature(message, signature, address), true);
  });

  it('rejects signature for wrong message', () => {
    const { privKey, address } = makeSecp256k1Keys();
    const signature = casperSign('hello world', privKey, 'secp256k1');
    assert.equal(verifyCasperSignature('goodbye world', signature, address), false);
  });

  it('rejects signature from wrong key', () => {
    const { address } = makeSecp256k1Keys();
    const other = makeSecp256k1Keys();
    const message = 'tiles.bot:metadata:42:1716700000';
    const signature = casperSign(message, other.privKey, 'secp256k1');
    assert.equal(verifyCasperSignature(message, signature, address), false);
  });
});

// — verifyEvmEoaSignature

describe('verifyEvmEoaSignature', () => {
  it('verifies a valid EVM EOA signature', async () => {
    const wallet = ethers.Wallet.createRandom();
    const message = 'tiles.bot:metadata:42:1716700000';
    const signature = await wallet.signMessage(message);
    assert.equal(verifyEvmEoaSignature(message, signature, wallet.address), true);
  });

  it('rejects signature from wrong wallet', async () => {
    const wallet1 = ethers.Wallet.createRandom();
    const wallet2 = ethers.Wallet.createRandom();
    const message = 'tiles.bot:metadata:42:1716700000';
    const signature = await wallet1.signMessage(message);
    assert.equal(verifyEvmEoaSignature(message, signature, wallet2.address), false);
  });

  it('rejects signature for wrong message', async () => {
    const wallet = ethers.Wallet.createRandom();
    const signature = await wallet.signMessage('original');
    assert.equal(verifyEvmEoaSignature('tampered', signature, wallet.address), false);
  });
});

// — Edge Cases

describe('Edge cases', () => {
  it('verifyCasperSignature rejects empty signature', () => {
    const { address } = makeEd25519Keys();
    assert.equal(verifyCasperSignature('msg', '', address), false);
  });

  it('verifyCasperSignature rejects signature with unknown algo byte', () => {
    const { privKey, address } = makeEd25519Keys();
    const message = 'test';
    let signature = casperSign(message, privKey, 'ed25519');
    // Replace algo byte 01 with 03 (unknown)
    signature = '03' + signature.slice(2);
    assert.equal(verifyCasperSignature(message, signature, address), false);
  });

  it('verifyCasperSignature rejects truncated signature', () => {
    const { privKey, address } = makeEd25519Keys();
    const message = 'test';
    const signature = casperSign(message, privKey, 'ed25519');
    // Truncate
    assert.equal(verifyCasperSignature(message, signature.slice(0, 20), address), false);
  });

  it('verifyCasperSignature rejects non-hex signature', () => {
    const { address } = makeEd25519Keys();
    assert.equal(verifyCasperSignature('msg', '01ggggnotvalidhex', address), false);
  });

  it('detectAddressChain handles null/undefined gracefully', () => {
    assert.equal(detectAddressChain(null), null);
    assert.equal(detectAddressChain(undefined), null);
  });
});
