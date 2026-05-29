import { describe, it, expect } from 'vitest';
import {
  createCasperSigner,
  computeAccountHash,
  toHex,
  fromHex,
  createCasperPaymentHeader,
  createCasperEIP712Domain,
  buildTransferAuthorization,
  signTransferAuthorization,
  selectCasperPaymentRequirements,
  CASPER_MAINNET_NETWORK,
} from '../src/index.js';
import type { CasperPaymentRequirements, CasperEIP712Domain } from '../src/index.js';

// -- Test fixtures

// Deterministic test key (DO NOT use in production)
const TEST_ED25519_PRIVATE_KEY = 'a'.repeat(64); // 32 bytes of 0xaa
const TEST_SECP256K1_PRIVATE_KEY = 'b'.repeat(64); // 32 bytes of 0xbb

const TEST_DOMAIN: CasperEIP712Domain = {
  name: 'WrappedCSPR',
  version: '1',
  chain_name: 'casper:casper',
  contract_package_hash: '0x' + '8d'.repeat(32),
};

const TEST_REQUIREMENTS: CasperPaymentRequirements = {
  scheme: 'exact',
  network: 'casper:casper',
  asset: 'hash-' + '8d'.repeat(32),
  maxAmountRequired: '10000000', // 0.01 CSPR
  payTo: '01' + 'cc'.repeat(32), // ed25519 public key
  resource: 'https://tiles.bot/api/tiles/42/claim',
  description: 'Claim tile #42 on tiles.bot',
  mimeType: 'application/json',
  maxTimeoutSeconds: 300,
  extra: {
    facilitator: 'https://x402-facilitator.cspr.cloud',
    nftContract: 'hash-abc123',
  },
};

// -- Hex utilities

describe('hex utilities', () => {
  it('toHex converts bytes to hex string', () => {
    const bytes = new Uint8Array([0x01, 0xab, 0xff, 0x00]);
    expect(toHex(bytes)).toBe('01abff00');
  });

  it('fromHex converts hex string to bytes', () => {
    const bytes = fromHex('01abff00');
    expect(bytes).toEqual(new Uint8Array([0x01, 0xab, 0xff, 0x00]));
  });

  it('fromHex handles 0x prefix', () => {
    const bytes = fromHex('0x01ab');
    expect(bytes).toEqual(new Uint8Array([0x01, 0xab]));
  });

  it('roundtrips correctly', () => {
    const original = '0123456789abcdef';
    expect(toHex(fromHex(original))).toBe(original);
  });
});

// -- AccountHash computation

describe('computeAccountHash', () => {
  it('produces a 0x-prefixed 32-byte hex string', () => {
    const hash = computeAccountHash('01', 'ab'.repeat(32));
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('different keys produce different hashes', () => {
    const hash1 = computeAccountHash('01', 'aa'.repeat(32));
    const hash2 = computeAccountHash('01', 'bb'.repeat(32));
    expect(hash1).not.toBe(hash2);
  });

  it('different algorithms produce different hashes for same raw key', () => {
    const rawKey = 'cc'.repeat(32);
    const hash01 = computeAccountHash('01', rawKey);
    const hash02 = computeAccountHash('02', rawKey);
    expect(hash01).not.toBe(hash02);
  });

  it('matches Casper protocol account-hash preimage for ed25519', () => {
    expect(computeAccountHash('01', 'aa'.repeat(32))).toBe(
      '0x6320ec6f164c6bfa1fd3208deb2b797dcf0177fd1de32a8a1597c29b42f73b1b',
    );
  });

  it('matches Casper protocol account-hash preimage for secp256k1', () => {
    expect(computeAccountHash('02', 'aa'.repeat(32))).toBe(
      '0xc44872342ec12499c138c4b1df8d223b88bbd725fd866b63747744f05c6102fe',
    );
  });
});

// -- CasperSigner creation

describe('createCasperSigner', () => {
  it('creates an ed25519 signer with correct public key prefix', () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    expect(signer.algorithm).toBe('ed25519');
    expect(signer.publicKeyHex).toMatch(/^01[0-9a-f]{64}$/);
    expect(signer.accountHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('creates a secp256k1 signer with correct public key prefix', () => {
    const signer = createCasperSigner(TEST_SECP256K1_PRIVATE_KEY, 'secp256k1');
    expect(signer.algorithm).toBe('secp256k1');
    expect(signer.publicKeyHex).toMatch(/^02[0-9a-f]+$/);
    expect(signer.accountHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('ed25519 signer can sign a 32-byte digest', async () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const digest = new Uint8Array(32).fill(0x42);
    const sig = await signer.sign(digest);
    expect(sig.length).toBe(64); // ed25519 signatures are 64 bytes
  });

  it('secp256k1 signer can sign a 32-byte digest', async () => {
    const signer = createCasperSigner(TEST_SECP256K1_PRIVATE_KEY, 'secp256k1');
    const digest = new Uint8Array(32).fill(0x42);
    const sig = await signer.sign(digest);
    expect(sig.length).toBe(64); // Casper compact secp256k1: r(32) + s(32), no recovery byte
  });

  it('same key produces deterministic public key', () => {
    const s1 = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const s2 = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    expect(s1.publicKeyHex).toBe(s2.publicKeyHex);
    expect(s1.accountHash).toBe(s2.accountHash);
  });

  it('handles 0x-prefixed private key', () => {
    const signer = createCasperSigner('0x' + TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const signer2 = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    expect(signer.publicKeyHex).toBe(signer2.publicKeyHex);
  });
});

// -- TransferAuthorization building

describe('buildTransferAuthorization', () => {
  it('builds a valid authorization message', () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const auth = buildTransferAuthorization(signer, TEST_REQUIREMENTS);

    expect(auth.from).toBe(signer.accountHash);
    expect(auth.to).toMatch(/^0x[0-9a-f]{64}$/);
    expect(auth.value).toBe('10000000');
    expect(typeof auth.valid_after).toBe('bigint');
    expect(typeof auth.valid_before).toBe('bigint');
    expect(auth.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('valid_before is after valid_after', () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const auth = buildTransferAuthorization(signer, TEST_REQUIREMENTS);
    expect(Number(auth.valid_before)).toBeGreaterThan(Number(auth.valid_after));
  });

  it('uses custom timeout', () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const auth = buildTransferAuthorization(signer, TEST_REQUIREMENTS, 60);
    const diff = Number(auth.valid_before) - Number(auth.valid_after);
    expect(diff).toBe(60);
  });

  it('generates unique nonces', () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const auth1 = buildTransferAuthorization(signer, TEST_REQUIREMENTS);
    const auth2 = buildTransferAuthorization(signer, TEST_REQUIREMENTS);
    expect(auth1.nonce).not.toBe(auth2.nonce);
  });
});

// -- EIP-712 signing

describe('signTransferAuthorization', () => {
  it('produces a 0x-prefixed hex signature (ed25519)', async () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const auth = buildTransferAuthorization(signer, TEST_REQUIREMENTS);
    const sig = await signTransferAuthorization(signer, TEST_DOMAIN, auth);
    expect(sig).toMatch(/^0x[0-9a-f]+$/);
    expect(sig.length).toBeGreaterThan(10);
  });

  it('produces a 0x-prefixed hex signature (secp256k1)', async () => {
    const signer = createCasperSigner(TEST_SECP256K1_PRIVATE_KEY, 'secp256k1');
    const auth = buildTransferAuthorization(signer, TEST_REQUIREMENTS);
    const sig = await signTransferAuthorization(signer, TEST_DOMAIN, auth);
    expect(sig).toMatch(/^0x[0-9a-f]+$/);
  });

  it('same message + same key = deterministic signature (ed25519)', async () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    // Use fixed nonce/timestamps for determinism
    const fixedAuth = {
      from: signer.accountHash,
      to: '0x' + 'dd'.repeat(32),
      value: '10000000',
      valid_after: BigInt(1000000),
      valid_before: BigInt(1000300),
      nonce: '0x' + 'ee'.repeat(32),
    };
    const sig1 = await signTransferAuthorization(signer, TEST_DOMAIN, fixedAuth);
    const sig2 = await signTransferAuthorization(signer, TEST_DOMAIN, fixedAuth);
    expect(sig1).toBe(sig2);
  });

  it('rejects a zero-address verifyingContract domain before signing', async () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const auth = buildTransferAuthorization(signer, TEST_REQUIREMENTS);
    await expect(signTransferAuthorization(signer, {
      name: 'WrappedCSPR',
      version: '1',
      chainId: 1514,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    }, auth)).rejects.toThrow(/zero-address verifyingContract/);
  });
});

// -- Casper EIP-712 domain

describe('createCasperEIP712Domain', () => {
  it('builds a Casper-native domain from a hash-prefixed contract package hash', () => {
    const domain = createCasperEIP712Domain(CASPER_MAINNET_NETWORK, 'hash-' + '8d'.repeat(32));
    expect(domain).toEqual({
      name: 'WrappedCSPR',
      version: '1',
      chain_name: 'casper:casper',
      contract_package_hash: '0x' + '8d'.repeat(32),
    });
  });

  it('rejects invalid contract package hashes', () => {
    expect(() => createCasperEIP712Domain(CASPER_MAINNET_NETWORK, 'hash-short')).toThrow(
      /contract package hash/,
    );
  });
});

// -- Full payment header

describe('createCasperPaymentHeader', () => {
  it('produces a base64-encoded string', async () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const header = await createCasperPaymentHeader(signer, TEST_REQUIREMENTS, TEST_DOMAIN);
    // Should be valid base64
    expect(typeof header).toBe('string');
    expect(header.length).toBeGreaterThan(0);
    // Should decode to valid JSON
    const decoded = JSON.parse(atob(header));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('casper:casper');
  });

  it('decoded payload has correct structure', async () => {
    const signer = createCasperSigner(TEST_ED25519_PRIVATE_KEY, 'ed25519');
    const header = await createCasperPaymentHeader(signer, TEST_REQUIREMENTS, TEST_DOMAIN);
    const decoded = JSON.parse(atob(header));

    expect(decoded.payload).toBeDefined();
    expect(decoded.payload.signature).toMatch(/^0x[0-9a-f]+$/);
    expect(decoded.payload.authorization).toBeDefined();
    expect(decoded.payload.authorization.from).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decoded.payload.authorization.to).toMatch(/^0x[0-9a-f]{64}$/);
    expect(decoded.payload.authorization.value).toBe('10000000');
    expect(decoded.payload.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('works with secp256k1 signer', async () => {
    const signer = createCasperSigner(TEST_SECP256K1_PRIVATE_KEY, 'secp256k1');
    const header = await createCasperPaymentHeader(signer, TEST_REQUIREMENTS, TEST_DOMAIN);
    const decoded = JSON.parse(atob(header));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.payload.signature).toMatch(/^0x[0-9a-f]+$/);
  });
});

// -- PaymentRequirements selector

describe('selectCasperPaymentRequirements', () => {
  it('selects Casper requirements from an array', () => {
    const requirements = [
      { ...TEST_REQUIREMENTS, network: 'eip155:8453' } as unknown as CasperPaymentRequirements,
      TEST_REQUIREMENTS,
    ];
    const selected = selectCasperPaymentRequirements(requirements);
    expect(selected).not.toBeNull();
    expect(selected!.network).toBe('casper:casper');
  });

  it('selects from wrapped object', () => {
    const body = { paymentRequirements: [TEST_REQUIREMENTS] };
    const selected = selectCasperPaymentRequirements(body);
    expect(selected).not.toBeNull();
    expect(selected!.network).toBe('casper:casper');
  });

  it('returns null when no Casper requirement exists', () => {
    const requirements = [
      { ...TEST_REQUIREMENTS, network: 'eip155:8453' } as unknown as CasperPaymentRequirements,
    ];
    const selected = selectCasperPaymentRequirements(requirements);
    expect(selected).toBeNull();
  });

  it('supports custom network filter', () => {
    const testnet = { ...TEST_REQUIREMENTS, network: 'casper:casper-test' };
    const selected = selectCasperPaymentRequirements([testnet], 'casper:casper-test');
    expect(selected).not.toBeNull();
    expect(selected!.network).toBe('casper:casper-test');
  });

  it('handles empty arrays', () => {
    expect(selectCasperPaymentRequirements([])).toBeNull();
    expect(selectCasperPaymentRequirements({ paymentRequirements: [] })).toBeNull();
  });
});
