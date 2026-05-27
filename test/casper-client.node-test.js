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

// Helper: create a network failure
function networkError(msg = 'Network error') {
  return Promise.reject(new Error(msg));
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
      // At 0 mints: exp(ln(11111) * 0 / 65536) / 100 = 1/100 = 0.01
      assert.ok(price > 0, 'Price should be positive');
      assert.ok(Math.abs(price - 0.01) < 0.001, `Price at 0 mints should be ~0.01 CSPR, got ${price}`);
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
      assert.ok(price1000 > 0.01, `Price at 1000 mints (${price1000}) should be > 0.01`);
    });
  });

  // — verifyOwnership

  describe('verifyOwnership', () => {
    it('returns true when account owns the tile', async () => {
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
    });

    it('validates tile ID range', async () => {
      const client = casperClient.createClient();

      await assert.rejects(
        () => client.buildMintInstructions(70000, '01' + 'ab'.repeat(32)),
        { message: /Invalid tile ID/ }
      );
    });
  });

  // — Bonding curve parity

  describe('bonding curve (JS parity)', () => {
    it('matches expected prices at key points', () => {
      const { computePrice } = casperClient;

      // At 0 mints: 0.01 CSPR
      const p0 = computePrice(0);
      assert.ok(Math.abs(p0 - 0.01) < 0.001, `Price at 0: ${p0} (expected ~0.01)`);

      // At 65535 mints: ~111.11 CSPR
      const pMax = computePrice(65535);
      assert.ok(Math.abs(pMax - 111.11) < 2, `Price at 65535: ${pMax} (expected ~111.11)`);

      // Monotonically increasing
      let prev = computePrice(0);
      for (let i = 100; i < 65536; i += 100) {
        const curr = computePrice(i);
        assert.ok(curr >= prev, `Price decreased at ${i}: ${curr} < ${prev}`);
        prev = curr;
      }
    });

    it('midpoint price matches sqrt(11111) * 0.01', () => {
      const { computePrice } = casperClient;
      const mid = computePrice(32768);
      // sqrt(11111) ≈ 105.41, * 0.01 = 1.054
      assert.ok(Math.abs(mid - 1.054) < 0.05, `Midpoint price: ${mid} (expected ~1.054)`);
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
