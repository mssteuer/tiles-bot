import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// — Mock global fetch before importing the module
let fetchMock;
let originalFetch;

// Helper: create a successful JSON-RPC response
function rpcOk(result) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
  };
}

// Helper: create an error JSON-RPC response
function rpcError(code, message, data) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      error: { code, message, data },
    }),
  };
}

describe('casper-client', () => {
  let casperClient;

  before(async () => {
    // Save original fetch and install mock
    originalFetch = globalThis.fetch;

    // Set env vars for the module
    process.env.CHAIN_CASPER_RPC_URL = 'https://mock-casper-rpc.test/rpc';
    process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    fetchMock = mock.fn(() => Promise.resolve(rpcOk({})));
    globalThis.fetch = fetchMock;

    // Dynamic import after env setup + fetch mock
    casperClient = await import('../src/lib/casper-client.js');
  });

  after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CHAIN_CASPER_RPC_URL;
    delete process.env.CHAIN_CASPER_NFT_CONTRACT;
  });

  beforeEach(() => {
    fetchMock.mock.resetCalls();
  });

  // — createClient

  describe('createClient', () => {
    it('uses default RPC URL from env', () => {
      const client = casperClient.createClient();
      assert.ok(client, 'Client should be created');
      assert.equal(client.rpcUrl, 'https://mock-casper-rpc.test/rpc');
    });

    it('accepts custom RPC URL', () => {
      const client = casperClient.createClient({ rpcUrl: 'https://custom.rpc/rpc' });
      assert.equal(client.rpcUrl, 'https://custom.rpc/rpc');
    });

    it('accepts custom contract hash', () => {
      const hash = 'hash-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const client = casperClient.createClient({ contractHash: hash });
      assert.equal(client.contractHash, hash);
    });

    it('accepts custom gas payment', async () => {
      const client = casperClient.createClient({ gasPayment: '5000000000' });

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: { cl_type: 'U64', bytes: '0000000000000000', parsed: 0 },
          },
        })
      );

      const instructions = await client.buildMintInstructions(0, '01' + 'ab'.repeat(32));
      assert.equal(instructions.paymentAmount, '5000000000');
    });
  });

  // — getTotalMinted

  describe('getTotalMinted', () => {
    it('returns total_minted from contract state', async () => {
      const client = casperClient.createClient();

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: 'U64',
              bytes: '0a00000000000000',
              parsed: 10,
            },
          },
        })
      );

      const total = await client.getTotalMinted();
      assert.equal(total, 10);

      // Verify RPC was called with query_global_state
      assert.equal(fetchMock.mock.callCount(), 1);
      const [url, opts] = fetchMock.mock.calls[0].arguments;
      assert.equal(url, 'https://mock-casper-rpc.test/rpc');
      const body = JSON.parse(opts.body);
      assert.equal(body.method, 'query_global_state');
    });

    it('returns 0 when named key not found', async () => {
      const client = casperClient.createClient();

      fetchMock.mock.mockImplementation(async () =>
        rpcError(-32003, 'query failed', 'ValueNotFound')
      );

      const total = await client.getTotalMinted();
      assert.equal(total, 0);
    });

    it('retries on network failure', async () => {
      const client = casperClient.createClient({ maxRetries: 2, retryDelay: 10 });
      let callCount = 0;

      fetchMock.mock.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Connection refused');
        }
        return rpcOk({
          stored_value: {
            CLValue: { cl_type: 'U64', bytes: '0500000000000000', parsed: 5 },
          },
        });
      });

      const total = await client.getTotalMinted();
      assert.equal(total, 5);
      assert.equal(callCount, 3); // 2 failures + 1 success
    });
  });

  // — getCurrentPrice

  describe('getCurrentPrice', () => {
    it('computes price from total_minted using bonding curve', async () => {
      const client = casperClient.createClient();

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: { cl_type: 'U64', bytes: '0000000000000000', parsed: 0 },
          },
        })
      );

      const price = await client.getCurrentPrice();
      // At 0 mints: 5 CSPR
      assert.ok(price > 0, 'Price should be positive');
      assert.ok(Math.abs(price - 5) < 0.001, `Price at 0 mints should be ~5 CSPR, got ${price}`);
    });

    it('returns higher price with more minted tiles', async () => {
      const client = casperClient.createClient();

      // First call: 1000 minted
      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: { cl_type: 'U64', bytes: 'e803000000000000', parsed: 1000 },
          },
        })
      );

      const price1000 = await client.getCurrentPrice();
      assert.ok(price1000 > 5, `Price at 1000 mints (${price1000}) should be > 5`);
    });
  });

  // — verifyOwnership

  describe('verifyOwnership', () => {
    it('returns true when account owns the tile (public key format)', async () => {
      const client = casperClient.createClient();
      // 66-char Casper public key: 01 prefix + 64 hex chars
      const account = '01' + '23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01';

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: { Option: 'Key' },
              parsed: account,
            },
          },
        })
      );

      const isOwner = await client.verifyOwnership(42, account);
      assert.equal(isOwner, true);
    });

    it('returns true when contract stores account-hash format (blake2b match)', async () => {
      const client = casperClient.createClient();
      // Input is a 66-char public key
      const publicKey = '01' + '23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01';
      // The blake2b-256 account hash of this public key
      const accountHashHex = '19f1822fe8d4adf8390df086daffa199adb5b8f9df1d887ebefe1e703a635e74';

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: { Option: 'Key' },
              parsed: `account-hash-${accountHashHex}`,
            },
          },
        })
      );

      // Public key is blake2b-hashed to the same account hash => match
      const isOwner = await client.verifyOwnership(42, publicKey);
      assert.equal(isOwner, true);
    });

    it('returns true when contract stores { Account: "account-hash-..." } object format', async () => {
      const client = casperClient.createClient();
      const publicKey = '01' + 'ab'.repeat(32);

      // Contract returns the public key wrapped in Account + account-hash format
      // But with the SAME public key hex (what Odra actually does in some implementations)
      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: { Option: 'Key' },
              parsed: { Account: publicKey },
            },
          },
        })
      );

      const isOwner = await client.verifyOwnership(42, publicKey);
      assert.equal(isOwner, true);
    });

    it('returns true when contract returns { Account: "account-hash-<blake2b>" } matching input pubkey', async () => {
      const client = casperClient.createClient();
      const publicKey = '01' + 'ab'.repeat(32);
      // blake2b-256 of 01ababab...ab
      const blake2bHash = 'c5e6730edf768e21dff15885d4e640ce2be26ed280ce0348c78595d75026f2ee';

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: { Option: 'Key' },
              parsed: { Account: `account-hash-${blake2bHash}` },
            },
          },
        })
      );

      // account-hash contains the blake2b of the input pubkey => match
      const isOwner = await client.verifyOwnership(42, publicKey);
      assert.equal(isOwner, true);
    });

    it('returns false when contract returns { Account: "account-hash-<hex>" } for different identity', async () => {
      const client = casperClient.createClient();
      const hex = 'ab'.repeat(32); // raw hex, not a blake2b of the input pubkey
      const publicKey = '01' + hex;

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: { Option: 'Key' },
              parsed: { Account: `account-hash-${hex}` },
            },
          },
        })
      );

      // account-hash is raw hex ab..ab, pubkey blake2b is c5e673... — different identities
      const isOwner = await client.verifyOwnership(42, publicKey);
      assert.equal(isOwner, false);
    });

    it('returns false when a different account owns the tile', async () => {
      const client = casperClient.createClient();
      // 66-char Casper public keys
      const claimer = '01' + '23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01';
      const actualOwner = '01' + 'ff456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01';

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: {
              cl_type: { Option: 'Key' },
              parsed: actualOwner,
            },
          },
        })
      );

      const isOwner = await client.verifyOwnership(42, claimer);
      assert.equal(isOwner, false);
    });

    it('returns false when tile is not minted', async () => {
      const client = casperClient.createClient();

      fetchMock.mock.mockImplementation(async () =>
        rpcError(-32003, 'query failed', 'ValueNotFound')
      );

      const isOwner = await client.verifyOwnership(42, '01' + 'ab'.repeat(32));
      assert.equal(isOwner, false);
    });

    it('validates tile ID range', async () => {
      const client = casperClient.createClient();

      await assert.rejects(
        () => client.verifyOwnership(-1, '01' + 'ab'.repeat(32)),
        { message: /Invalid tile ID/ }
      );

      await assert.rejects(
        () => client.verifyOwnership(65536, '01' + 'ab'.repeat(32)),
        { message: /Invalid tile ID/ }
      );
    });

    it('validates account hash format', async () => {
      const client = casperClient.createClient();

      await assert.rejects(
        () => client.verifyOwnership(0, 'not-a-valid-hash'),
        { message: /Invalid Casper account/ }
      );
    });
  });

  // — normalizeToAccountHash

  describe('normalizeToAccountHash', () => {
    it('extracts hex from account-hash format', () => {
      const hex = 'ab'.repeat(32);
      const result = casperClient.normalizeToAccountHash(`account-hash-${hex}`);
      assert.equal(result, hex);
    });

    it('passes through raw 64-char hex', () => {
      const hex = 'ab'.repeat(32);
      const result = casperClient.normalizeToAccountHash(hex);
      assert.equal(result, hex);
    });

    it('blake2b-hashes 66-char public key to 64-char account hash', () => {
      const pubkey = '01' + 'ab'.repeat(32);
      const result = casperClient.normalizeToAccountHash(pubkey);
      // blake2b-256 of 01ababab...ab
      assert.equal(result, 'c5e6730edf768e21dff15885d4e640ce2be26ed280ce0348c78595d75026f2ee');
      assert.equal(result.length, 64, 'Account hash should be 64 hex chars');
    });

    it('returns null for invalid input', () => {
      assert.equal(casperClient.normalizeToAccountHash(null), null);
      assert.equal(casperClient.normalizeToAccountHash(''), null);
      assert.equal(casperClient.normalizeToAccountHash('xyz'), null);
    });
  });

  // — publicKeyToAccountHash

  describe('publicKeyToAccountHash', () => {
    it('computes correct blake2b-256 hash for ed25519 key (01 prefix)', () => {
      const pubkey = '01' + 'ab'.repeat(32);
      const result = casperClient.publicKeyToAccountHash(pubkey);
      assert.equal(result, 'c5e6730edf768e21dff15885d4e640ce2be26ed280ce0348c78595d75026f2ee');
      assert.equal(result.length, 64);
    });

    it('computes correct blake2b-256 hash for secp256k1 key (02 prefix)', () => {
      const pubkey = '02' + 'ef'.repeat(32);
      const result = casperClient.publicKeyToAccountHash(pubkey);
      assert.equal(result, '637ed7f02f23dce965d07aeb3daf2cf901f517c7b010038e8fb1dd5cc906bede');
    });
  });

  // — extractAccountHash

  describe('extractAccountHash', () => {
    it('extracts from account-hash string', () => {
      const hex = 'cd'.repeat(32);
      const result = casperClient.extractAccountHash(`account-hash-${hex}`);
      assert.equal(result, hex);
    });

    it('hashes public key string to account hash', () => {
      const pubkey = '02' + 'ef'.repeat(32);
      const result = casperClient.extractAccountHash(pubkey);
      // blake2b-256 of 02efef...ef
      assert.equal(result, '637ed7f02f23dce965d07aeb3daf2cf901f517c7b010038e8fb1dd5cc906bede');
    });

    it('extracts from { Account: "account-hash-..." } object', () => {
      const hex = 'ab'.repeat(32);
      const result = casperClient.extractAccountHash({ Account: `account-hash-${hex}` });
      assert.equal(result, hex);
    });

    it('hashes { PublicKey: "01..." } object to account hash', () => {
      const pubkey = '01' + 'cd'.repeat(32);
      const result = casperClient.extractAccountHash({ PublicKey: pubkey });
      // blake2b-256 of 01cdcd...cd
      assert.equal(result, '1870593b5ece791e574b4142c0da89bd6f7408e67171c48135b11fc0ac87f997');
    });

    it('returns null for unrecognized formats', () => {
      assert.equal(casperClient.extractAccountHash(null), null);
      assert.equal(casperClient.extractAccountHash(42), null);
      assert.equal(casperClient.extractAccountHash({}), null);
    });
  });

  // — getDeployStatus

  describe('getDeployStatus', () => {
    it('returns success status for executed deploy', async () => {
      const client = casperClient.createClient();
      const deployHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          execution_info: {
            execution_result: {
              Version2: {
                initiator: { PublicKey: '01abcdef...' },
                error_message: null,
                cost: '100000000',
              },
            },
          },
        })
      );

      const status = await client.getDeployStatus(deployHash);
      assert.equal(status.executed, true);
      assert.equal(status.success, true);
      assert.equal(status.errorMessage, null);
    });

    it('returns failure status for failed deploy', async () => {
      const client = casperClient.createClient();
      const deployHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          execution_info: {
            execution_result: {
              Version2: {
                initiator: { PublicKey: '01abcdef...' },
                error_message: 'Out of gas',
                cost: '250000000000',
              },
            },
          },
        })
      );

      const status = await client.getDeployStatus(deployHash);
      assert.equal(status.executed, true);
      assert.equal(status.success, false);
      assert.equal(status.errorMessage, 'Out of gas');
    });

    it('returns pending status when deploy not found', async () => {
      const client = casperClient.createClient();
      const deployHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      fetchMock.mock.mockImplementation(async () =>
        rpcError(-32014, 'No such transaction')
      );

      const status = await client.getDeployStatus(deployHash);
      assert.equal(status.executed, false);
      assert.equal(status.success, false);
      assert.equal(status.pending, true);
    });

    it('validates deploy hash format', async () => {
      const client = casperClient.createClient();

      await assert.rejects(
        () => client.getDeployStatus('not-a-hash'),
        { message: /Invalid deploy hash/ }
      );
    });
  });

  // — buildMintInstructions

  describe('buildMintInstructions', () => {
    it('returns claim instructions with current price', async () => {
      const client = casperClient.createClient();
      const account = '01' + 'ab'.repeat(32);

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: { cl_type: 'U64', bytes: '0000000000000000', parsed: 0 },
          },
        })
      );

      const instructions = await client.buildMintInstructions(42, account);
      assert.equal(instructions.tileId, 42);
      assert.ok(instructions.price > 0, 'Price should be positive');
      assert.equal(instructions.contractHash, process.env.CHAIN_CASPER_NFT_CONTRACT);
      assert.equal(instructions.entryPoint, 'claim');
      assert.ok(instructions.args, 'Should include entry point args');
      assert.ok(instructions.wcspr, 'Should include wCSPR approval info');
      assert.equal(instructions.chainName, 'casper');
      assert.equal(instructions.paymentAmount, '2500000000');
    });

    it('uses custom chain name from options', async () => {
      const client = casperClient.createClient({ chainName: 'casper-test' });

      fetchMock.mock.mockImplementation(async () =>
        rpcOk({
          stored_value: {
            CLValue: { cl_type: 'U64', bytes: '0000000000000000', parsed: 0 },
          },
        })
      );

      const instructions = await client.buildMintInstructions(0, '01' + 'ab'.repeat(32));
      assert.equal(instructions.chainName, 'casper-test');
    });

    it('validates tile ID range', async () => {
      const client = casperClient.createClient();

      await assert.rejects(
        () => client.buildMintInstructions(70000, '01' + 'ab'.repeat(32)),
        { message: /Invalid tile ID/ }
      );
    });
  });

  // — SSE event stream

  describe('createEventStream', () => {
    it('creates event stream with derived SSE URL', () => {
      const client = casperClient.createClient();
      const stream = client.createEventStream();
      assert.ok(stream.sseUrl, 'Should have SSE URL');
      assert.ok(stream.sseUrl.includes('18101'), 'SSE URL should use port 18101');
    });

    it('creates event stream with custom SSE URL', () => {
      const stream = casperClient.createEventStream({
        sseUrl: 'https://custom-sse.test/events/deploys',
      });
      assert.equal(stream.sseUrl, 'https://custom-sse.test/events/deploys');
    });

    it('correctly derives SSE URL from ported RPC URL (no double-port)', () => {
      // Regression: localhost:7777/rpc should become localhost:18101/events/deploys
      // NOT localhost:7777:18101/events/deploys
      const stream = casperClient.createEventStream({
        rpcUrl: 'http://localhost:7777/rpc',
      });
      assert.equal(stream.sseUrl, 'http://localhost:18101/events/deploys');
    });

    it('correctly derives SSE URL from portless RPC URL', () => {
      const stream = casperClient.createEventStream({
        rpcUrl: 'https://node.mainnet.casper.network/rpc',
      });
      assert.equal(stream.sseUrl, 'https://node.mainnet.casper.network:18101/events/deploys');
    });

    it('has subscribe and waitForDeploy methods', () => {
      const stream = casperClient.createEventStream({
        sseUrl: 'https://sse.test/events/deploys',
      });
      assert.equal(typeof stream.subscribe, 'function');
      assert.equal(typeof stream.waitForDeploy, 'function');
    });

    it('subscribe returns an AbortController', () => {
      // Mock fetch to return a readable stream that never sends data
      const originalImpl = fetchMock.mock.mockImplementation(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: () => new Promise(() => {}), // never resolves
          }),
        },
      }));

      const stream = casperClient.createEventStream({
        sseUrl: 'https://sse.test/events/deploys',
      });

      const controller = stream.subscribe(() => {});
      assert.ok(controller instanceof AbortController, 'subscribe should return AbortController');
      controller.abort(); // cleanup
    });
  });

  // — Bonding curve parity

  describe('bonding curve (JS parity)', () => {
    it('matches expected prices at key points', () => {
      const { computePrice } = casperClient;

      // At 0 mints: 5 CSPR
      const p0 = computePrice(0);
      assert.ok(Math.abs(p0 - 5) < 0.001, `Price at 0: ${p0} (expected ~5)`);

      // At 65535 mints: ~55,555 CSPR
      const pMax = computePrice(65535);
      assert.ok(Math.abs(pMax - 55555) < 1000, `Price at 65535: ${pMax} (expected ~55,555)`);

      // Monotonically increasing
      let prev = computePrice(0);
      for (let i = 100; i < 65536; i += 100) {
        const curr = computePrice(i);
        assert.ok(curr >= prev, `Price decreased at ${i}: ${curr} < ${prev}`);
        prev = curr;
      }
    });

    it('midpoint price matches sqrt(11111) * 5', () => {
      const { computePrice } = casperClient;
      const mid = computePrice(32768);
      // sqrt(11111) ≈ 105.41, * 5 = ~527
      assert.ok(Math.abs(mid - 527) < 25, `Midpoint price: ${mid} (expected ~527)`);
    });
  });

  // — Error handling

  describe('error handling', () => {
    it('throws CasperRpcError with details on unexpected RPC error', async () => {
      const client = casperClient.createClient({ maxRetries: 0 });

      fetchMock.mock.mockImplementation(async () =>
        rpcError(-32000, 'Internal error', 'Something went wrong')
      );

      await assert.rejects(
        () => client.getTotalMinted(),
        (err) => {
          assert.ok(err.message.includes('Internal error'));
          return true;
        }
      );
    });

    it('throws on HTTP error', async () => {
      const client = casperClient.createClient({ maxRetries: 0 });

      fetchMock.mock.mockImplementation(async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Server overloaded',
      }));

      await assert.rejects(
        () => client.getTotalMinted(),
        (err) => {
          assert.ok(err.message.includes('503'));
          return true;
        }
      );
    });
  });
});
