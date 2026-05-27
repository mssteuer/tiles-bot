// — Casper Blockchain Client
// Server-side client for interacting with the tiles.bot CEP-95/96 NFT contract on Casper.
// Uses JSON-RPC directly for reliable contract state queries.

// — Constants

const TOTAL_TILES = 65536;
const CASPER_HASH_PATTERN = /^(01|02)[0-9a-fA-F]{64}$/;
const DEPLOY_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // ms

// — Bonding Curve (JS parity with Solidity/Rust contracts)
// Formula: price = exp(ln(11111) * totalMinted / 65536) / 100

function computePrice(totalMinted) {
  if (totalMinted >= TOTAL_TILES) return Infinity;
  return Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES) / 100;
}

// — RPC helpers

class CasperRpcError extends Error {
  constructor(code, message, data) {
    super(`Casper RPC error ${code}: ${message}${data ? ` (${data})` : ''}`);
    this.name = 'CasperRpcError';
    this.code = code;
    this.data = data;
  }
}

async function rpcCall(rpcUrl, method, params, { maxRetries = DEFAULT_MAX_RETRIES, retryDelay = DEFAULT_RETRY_DELAY } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
      }

      const data = await response.json();

      if (data.error) {
        return { error: data.error, result: null };
      }

      return { error: null, result: data.result };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// — Query contract named key via query_global_state

async function queryContractNamedKey(rpcUrl, entityAddr, path, opts) {
  const { error, result } = await rpcCall(rpcUrl, 'query_global_state', {
    state_identifier: null,
    key: entityAddr,
    path,
  }, opts);

  if (error) {
    // ValueNotFound is expected for uninitialized/missing keys
    if (error.code === -32003 || (error.data && String(error.data).includes('ValueNotFound'))) {
      return null;
    }
    throw new CasperRpcError(error.code, error.message, error.data);
  }

  return result;
}

// — Parse CLValue from query result

function parseCLValue(result) {
  if (!result?.stored_value?.CLValue) return null;
  const clv = result.stored_value.CLValue;
  return clv.parsed !== undefined ? clv.parsed : null;
}

// — Validation helpers

function validateTileId(tileId) {
  if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    throw new Error(`Invalid tile ID: ${tileId}. Must be 0-65535.`);
  }
}

function validateCasperAccount(account) {
  if (!account || typeof account !== 'string' || !CASPER_HASH_PATTERN.test(account)) {
    throw new Error(`Invalid Casper account: ${account}. Expected 01/02 prefix + 64 hex chars.`);
  }
}

function validateDeployHash(hash) {
  if (!hash || typeof hash !== 'string' || !DEPLOY_HASH_PATTERN.test(hash)) {
    throw new Error(`Invalid deploy hash: ${hash}. Expected 64 hex chars.`);
  }
}

// — Build the entity-addr key for an Odra contract
// Odra contracts on Casper 2.0 are addressable entities.
// The contract hash (from env) needs to be prefixed with entity-contract-.

function contractEntityAddr(contractHash) {
  // contractHash comes as "hash-<64 hex chars>" — strip prefix
  const hex = contractHash.replace(/^hash-/, '');
  return `entity-contract-${hex}`;
}

// — Client factory

function createClient(options = {}) {
  const rpcUrl = options.rpcUrl || process.env.CHAIN_CASPER_RPC_URL;
  const contractHash = options.contractHash || process.env.CHAIN_CASPER_NFT_CONTRACT;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;

  if (!rpcUrl) {
    throw new Error('Casper RPC URL not configured. Set CHAIN_CASPER_RPC_URL.');
  }

  const retryOpts = { maxRetries, retryDelay };
  const entityAddr = contractHash ? contractEntityAddr(contractHash) : null;

  return {
    rpcUrl,
    contractHash,

    // — Get total number of tiles minted on Casper
    async getTotalMinted() {
      if (!entityAddr) throw new Error('NFT contract hash not configured');

      const result = await queryContractNamedKey(rpcUrl, entityAddr, ['total_minted'], retryOpts);
      if (result === null) return 0;
      const parsed = parseCLValue(result);
      return typeof parsed === 'number' ? parsed : 0;
    },

    // — Get current price in CSPR (computed from bonding curve)
    async getCurrentPrice() {
      const totalMinted = await this.getTotalMinted();
      return computePrice(totalMinted);
    },

    // — Verify on-chain ownership of a tile
    // Queries CEP-95 owner_of via the token owners dictionary
    async verifyOwnership(tileId, accountHash) {
      validateTileId(tileId);
      validateCasperAccount(accountHash);
      if (!entityAddr) throw new Error('NFT contract hash not configured');

      // CEP-95 stores ownership in token_owners dictionary keyed by token_id
      // Odra stores this as a named key path: cep95 > token_owners > {token_id}
      // We query via the contract's named key structure
      const result = await queryContractNamedKey(
        rpcUrl,
        entityAddr,
        ['cep95', 'token_owners', String(tileId)],
        retryOpts
      );

      if (result === null) return false;

      const parsed = parseCLValue(result);
      if (!parsed) return false;

      // The owner is returned as an Address (Account or Contract key)
      // Normalize both to compare
      const ownerHex = extractAccountHash(parsed);
      if (!ownerHex) return false;

      return ownerHex.toLowerCase() === accountHash.toLowerCase();
    },

    // — Get deploy/transaction status
    async getDeployStatus(deployHash) {
      validateDeployHash(deployHash);

      // Try info_get_transaction first (Casper 2.0)
      const { error, result } = await rpcCall(
        rpcUrl,
        'info_get_transaction',
        {
          transaction_hash: { Deploy: deployHash },
          finalized_approvals: false,
        },
        retryOpts
      );

      if (error) {
        // -32014 = "No such transaction" — deploy is pending or unknown
        if (error.code === -32014) {
          return { executed: false, success: false, pending: true, errorMessage: null, cost: null };
        }
        throw new CasperRpcError(error.code, error.message, error.data);
      }

      // Parse execution result
      const execInfo = result?.execution_info;
      if (!execInfo?.execution_result) {
        return { executed: false, success: false, pending: true, errorMessage: null, cost: null };
      }

      const execResult = execInfo.execution_result;
      // Casper 2.0 uses Version2 execution results
      const v2 = execResult.Version2 || execResult.Success || execResult;
      const errorMessage = v2.error_message || null;
      const cost = v2.cost || null;

      return {
        executed: true,
        success: !errorMessage,
        pending: false,
        errorMessage,
        cost,
      };
    },

    // — Build instructions for minting a tile
    // Returns data needed for the frontend/wallet to construct and sign the transaction
    async buildMintInstructions(tileId, accountHash) {
      validateTileId(tileId);
      validateCasperAccount(accountHash);

      const totalMinted = await this.getTotalMinted();
      const price = computePrice(totalMinted);

      // Price in motes (1 CSPR = 1,000,000,000 motes)
      const priceMotes = Math.ceil(price * 1_000_000_000);

      return {
        tileId,
        price,
        priceMotes: String(priceMotes),
        contractHash,
        entryPoint: 'claim',
        args: {
          token_id: { type: 'U256', value: String(tileId) },
        },
        wcspr: {
          // Caller must approve wCSPR transfer before calling claim
          approveAmount: String(priceMotes),
          spender: contractHash,
        },
        chainName: process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper',
        paymentAmount: '2500000000', // 2.5 CSPR gas
      };
    },
  };
}

// — Extract account hash from a parsed CLValue owner field
// Casper 2.0 returns ownership as various key types

function extractAccountHash(parsed) {
  if (typeof parsed === 'string') {
    // "account-hash-<hex>" format
    const match = parsed.match(/account-hash-([0-9a-fA-F]{64})/);
    if (match) return match[1];
    // Direct public key (01/02 prefix + 64 hex = 66 chars)
    if (CASPER_HASH_PATTERN.test(parsed)) return parsed;
    return null;
  }
  if (parsed && typeof parsed === 'object') {
    // { Account: "account-hash-..." } format
    if (parsed.Account) return extractAccountHash(parsed.Account);
    // { PublicKey: "01..." } format
    if (parsed.PublicKey) return parsed.PublicKey;
    return null;
  }
  return null;
}

export {
  createClient,
  computePrice,
  CasperRpcError,
  TOTAL_TILES,
};
