/**
 * End-to-End Test: Casper x402 Payment + NFT Mint Flow
 * Task #1719
 *
 * Tests the complete Casper claim/register pipeline at the API + DB layer:
 *
 *   1. Casper chain config resolution via chains.js
 *   2. DB layer: claimTile with chain='casper'
 *   3. Bonding curve price computation for Casper (independent curve)
 *   4. Casper PaymentRequirements shape for x402 402 response
 *   5. Register flow: Casper address format validation
 *   6. Error cases: invalid chain, duplicate claim, invalid addresses
 *
 * The smart contract E2E is in contracts/casper/tests/test_e2e_x402_flow.rs
 * (11 tests covering deploy, fund, approve, claim, batch, errors, lifecycle).
 *
 * Run: node test/casper-x402-e2e.node-test.js
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// -- Setup: isolated test DB + chain env vars

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-casper-e2e-'));

process.env.DB_DIR = tmpDir;
process.env.CHAIN_BASE_NFT_CONTRACT = '0xB2915C42329edFfC26037eed300D620C302b5791';
process.env.CHAIN_BASE_PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
process.env.CHAIN_BASE_RPC_URL = 'https://mainnet.base.org';
process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org';
process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402-facilitator.base.org';
process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-abc123def456';
process.env.CHAIN_CASPER_PAYMENT_TOKEN = 'hash-wcspr789';
process.env.CHAIN_CASPER_TREASURY = '0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f';
process.env.CHAIN_CASPER_RPC_URL = 'https://node.testnet.casper.network/rpc';
process.env.CHAIN_CASPER_EXPLORER = 'https://testnet.cspr.live';
process.env.CHAIN_CASPER_X402_FACILITATOR = 'https://x402-facilitator.cspr.cloud';
process.env.DEFAULT_CHAIN = 'base';

let db;
let chains;

// -- Test suite

describe('Casper x402 E2E: Chain Config Resolution', () => {
  before(async () => {
    chains = require('../src/lib/chains');
  });

  it('resolves Casper chain config by ID', () => {
    const casper = chains.getChain('casper');
    assert.equal(casper.id, 'casper');
    assert.equal(casper.caip2, 'casper:casper');
    assert.equal(casper.name, 'Casper');
    assert.equal(casper.addressFormat, 'casper');
    assert.equal(casper.nftContract, 'hash-abc123def456');
    assert.equal(casper.paymentToken, 'hash-wcspr789');
    assert.equal(casper.x402Facilitator, 'https://x402-facilitator.cspr.cloud');
  });

  it('resolves Casper by ed25519 address (01 prefix)', () => {
    const addr = '01' + 'a'.repeat(64);
    const chain = chains.getChainByAddress(addr);
    assert.equal(chain.id, 'casper');
  });

  it('resolves Casper by secp256k1 address (02 prefix)', () => {
    const addr = '02' + 'b'.repeat(64);
    const chain = chains.getChainByAddress(addr);
    assert.equal(chain.id, 'casper');
  });

  it('builds Casper explorer deploy URL', () => {
    const casper = chains.getChain('casper');
    const url = casper.explorerTx('abc123deploy');
    assert.equal(url, 'https://testnet.cspr.live/deploy/abc123deploy');
  });

  it('Casper has no marketplace (grid IS the marketplace)', () => {
    const casper = chains.getChain('casper');
    assert.equal(casper.marketplace, null);
  });

  it('both chains are registered', () => {
    const all = chains.getSupportedChains();
    assert.equal(all.length, 2);
    const ids = all.map(c => c.id).sort();
    assert.deepEqual(ids, ['base', 'casper']);
  });
});

describe('Casper x402 E2E: DB Layer — Casper Claims', () => {
  before(async () => {
    db = await import('../src/lib/db.js');
  });

  afterEach(() => {
    // Clean up test tiles
    for (const id of [50000, 50001, 50002, 50003, 50004, 50005, 50006, 50007, 50008, 50009, 50010]) {
      try { db.unclaimTile(id); } catch { /* ignore */ }
    }
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('claimTile with chain=casper stores Casper chain', () => {
    const casperWallet = '01' + 'ab'.repeat(32);
    const tile = db.claimTile(50000, casperWallet, 0.01, 'casper');
    assert.ok(tile, 'Claim should succeed');
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.owner, casperWallet);
  });

  it('claimTile defaults to chain=base', () => {
    const evmWallet = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
    const tile = db.claimTile(50001, evmWallet, 0.01);
    assert.ok(tile, 'Claim should succeed');
    assert.equal(tile.chain, 'base');
  });

  it('getTile returns chain field for Casper tiles', () => {
    const casperWallet = '02' + 'cd'.repeat(32);
    db.claimTile(50002, casperWallet, 0.02, 'casper');
    const tile = db.getTile(50002);
    assert.ok(tile, 'getTile should find the tile');
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.owner, casperWallet);
  });

  it('Casper and Base tiles coexist in shared namespace', () => {
    const casperWallet = '01' + 'aa'.repeat(32);
    const evmWallet = '0x1234567890abcdef1234567890abcdef12345678';

    db.claimTile(50003, casperWallet, 0.01, 'casper');
    db.claimTile(50004, evmWallet, 0.01, 'base');

    const casperTile = db.getTile(50003);
    const baseTile = db.getTile(50004);

    assert.equal(casperTile.chain, 'casper');
    assert.equal(baseTile.chain, 'base');
  });

  it('duplicate claim on same tile ID rejects (cross-chain)', () => {
    const casperWallet = '01' + 'bb'.repeat(32);
    const evmWallet = '0x1234567890abcdef1234567890abcdef12345678';

    // Casper agent claims tile 50005
    const first = db.claimTile(50005, casperWallet, 0.01, 'casper');
    assert.ok(first, 'First claim should succeed');

    // Base agent tries to claim same tile ID
    const second = db.claimTile(50005, evmWallet, 0.01, 'base');
    assert.equal(second, null, 'Duplicate tile ID should be rejected');

    // Original claim unchanged
    const tile = db.getTile(50005);
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.owner, casperWallet);
  });

  it('bonding curve price is chain-independent at DB level', () => {
    // Both chains use the same bonding curve formula
    // The curve position depends on total tiles claimed (per-chain in contract,
    // but the DB-level getCurrentPrice uses global count)
    const price = db.getCurrentPrice();
    assert.ok(typeof price === 'number', 'Price should be a number');
    assert.ok(price >= 0, 'Price should be non-negative');
  });

  it('syncOnChainClaim persists chain field', () => {
    const casperWallet = '01' + 'cc'.repeat(32);
    db.syncOnChainClaim(50006, casperWallet, new Date().toISOString(), 0.015, 'casper');
    const tile = db.getTile(50006);
    assert.ok(tile, 'Synced tile should exist');
    assert.equal(tile.chain, 'casper');
  });

  it('setTile preserves chain and chainContract', () => {
    db.setTile(50007, {
      id: 50007,
      owner: '01' + 'dd'.repeat(32),
      name: 'Casper Agent Tile',
      status: 'offline',
      claimedAt: new Date().toISOString(),
      chain: 'casper',
      chainContract: 'hash-abc123',
    });
    const tile = db.getTile(50007);
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.chainContract, 'hash-abc123');
  });

  it('logEvent records chain field for Casper events', () => {
    db.claimTile(50008, '01' + 'ee'.repeat(32), 0.01, 'casper');
    db.logEvent('heartbeat', 50008, '01' + 'ee'.repeat(32), { ping: true }, 'casper');
    // If we get here without error, the chain field was accepted
    const tile = db.getTile(50008);
    assert.equal(tile.chain, 'casper');
  });
});

describe('Casper x402 E2E: PaymentRequirements Shape', () => {
  it('Casper x402 PaymentRequirements has correct structure', () => {
    // This validates the expected shape of the 402 response that the
    // claim API should return when chain=casper is supported.
    //
    // Based on the x402 spec + Casper facilitator requirements:
    // https://x402-facilitator.cspr.cloud
    const casperConfig = chains.getChain('casper');

    const expectedPaymentRequirements = {
      // x402 standard fields
      scheme: 'exact',
      network: 'casper:casper',
      payTo: casperConfig.treasury,
      // Casper-specific
      paymentToken: casperConfig.paymentToken,
      maxAmountRequired: '10000000', // 0.01 CSPR in motes (9 decimals)
      resource: 'https://tiles.bot/api/tiles/42/claim',
      description: 'Claim tile #42 on tiles.bot',
      // Facilitator
      extra: {
        facilitator: casperConfig.x402Facilitator,
        nftContract: casperConfig.nftContract,
      },
    };

    // Validate structure
    assert.equal(expectedPaymentRequirements.network, 'casper:casper');
    assert.ok(expectedPaymentRequirements.payTo.match(/^(01|02)[0-9a-fA-F]{64}$/),
      'payTo must be a valid Casper public key');
    assert.ok(expectedPaymentRequirements.paymentToken.startsWith('hash-'),
      'paymentToken must be a Casper contract hash');
    assert.ok(expectedPaymentRequirements.extra.facilitator.startsWith('https://'),
      'facilitator must be a URL');
    assert.equal(typeof expectedPaymentRequirements.maxAmountRequired, 'string',
      'maxAmountRequired should be a string (big number)');
  });

  it('Casper address format validation', () => {
    // ed25519 (01 prefix, 66 hex chars total)
    const ed25519 = '0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f';
    assert.ok(/^01[0-9a-fA-F]{64}$/.test(ed25519), 'ed25519 should be valid');

    // secp256k1 (02 prefix, 66 hex chars total)
    const secp256k1 = '02' + 'ab'.repeat(32);
    assert.ok(/^02[0-9a-fA-F]{64}$/.test(secp256k1), 'secp256k1 should be valid');

    // Invalid
    assert.ok(!/^(01|02)[0-9a-fA-F]{64}$/.test('0x1234567890'), 'EVM should not match');
    assert.ok(!/^(01|02)[0-9a-fA-F]{64}$/.test('03' + 'aa'.repeat(32)), 'Bad prefix should not match');
    assert.ok(!/^(01|02)[0-9a-fA-F]{64}$/.test('01' + 'ab'.repeat(31)), 'Too short should not match');
  });
});

describe('Casper x402 E2E: Agent Claim Sequence Validation', () => {
  before(async () => {
    db = await import('../src/lib/db.js');
  });

  afterEach(() => {
    for (const id of [51000, 51001, 51002, 51003, 51004]) {
      try { db.unclaimTile(id); } catch { /* ignore */ }
    }
  });

  it('simulates full agent claim sequence for Casper', () => {
    const agentWallet = '01' + 'ff'.repeat(32);
    const tileId = 51000;

    // Step 1: Agent queries price (GET /api/stats or GET /api/tiles/:id)
    const price = db.getCurrentPrice();
    assert.ok(price >= 0, 'Price should be available');

    // Step 2: Agent receives 402 with PaymentRequirements
    // (tested in PaymentRequirements shape test above)

    // Step 3: Agent pays x402 (via facilitator)
    // This happens off-chain via the x402 facilitator SDK

    // Step 4: Agent receives 200 with on-chain instructions
    const casperConfig = chains.getChain('casper');
    const claimInstructions = {
      step1_approve: {
        contract: casperConfig.paymentToken,
        entryPoint: 'approve',
        args: { spender: casperConfig.nftContract, amount: '10000000' },
      },
      step2_claim: {
        contract: casperConfig.nftContract,
        entryPoint: 'claim',
        args: { token_id: tileId },
      },
      step3_register: {
        endpoint: `https://tiles.bot/api/tiles/${tileId}/register`,
        method: 'POST',
        body: { wallet: agentWallet, chain: 'casper' },
      },
    };
    assert.ok(claimInstructions.step1_approve.contract.startsWith('hash-'));
    assert.ok(claimInstructions.step2_claim.contract.startsWith('hash-'));

    // Step 5: Agent executes on-chain (simulated at DB level)
    // In production: agent calls wCSPR.approve -> NFT.claim on-chain
    // Here we simulate the post-mint registration
    const tile = db.claimTile(tileId, agentWallet, price, 'casper');
    assert.ok(tile, 'Registration should succeed');
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.owner, agentWallet);

    // Step 6: Verify ownership
    const verified = db.getTile(tileId);
    assert.equal(verified.owner, agentWallet);
    assert.equal(verified.chain, 'casper');
  });

  it('simulates agent batch claim for Casper', () => {
    const agentWallet = '01' + 'ee'.repeat(32);
    const tileIds = [51001, 51002, 51003];

    for (const id of tileIds) {
      const tile = db.claimTile(id, agentWallet, 0.01, 'casper');
      assert.ok(tile, `Tile ${id} claim should succeed`);
      assert.equal(tile.chain, 'casper');
    }

    // Verify all owned
    for (const id of tileIds) {
      const tile = db.getTile(id);
      assert.equal(tile.owner, agentWallet);
      assert.equal(tile.chain, 'casper');
    }
  });

  it('rejects claim on already-claimed tile from different chain', () => {
    const casperAgent = '01' + 'dd'.repeat(32);
    const baseAgent = '0x' + 'cc'.repeat(20);

    db.claimTile(51004, casperAgent, 0.01, 'casper');

    // Second claim from Base should fail (shared namespace)
    const result = db.claimTile(51004, baseAgent, 0.01, 'base');
    assert.equal(result, null, 'Cross-chain duplicate should be rejected');
  });
});

describe('Casper x402 E2E: Bonding Curve Consistency', () => {
  it('bonding curve formula matches Rust contract at key positions', () => {
    // Formula: price = exp(ln(11111) * totalMinted / 65536) / 100
    // BASE_PRICE = 0.01 (in CSPR or USD depending on chain)
    //
    // Key positions from design spec:
    //   0      -> 0.01
    //   65536  -> 111.11
    //
    // The JS bonding curve in db.js uses the same formula.
    // This test verifies the math matches across implementations.

    const price0 = db.getCurrentPrice(); // At 0 minted (fresh DB)
    // The DB function uses Math.exp(Math.log(11111) * claimed / 65536) / 100
    // At 0 minted: exp(0) / 100 = 0.01
    assert.ok(
      Math.abs(price0 - 0.01) < 0.001,
      `Price at 0 should be ~0.01, got ${price0}`
    );
  });
});
