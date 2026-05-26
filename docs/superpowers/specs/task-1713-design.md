# Chain Abstraction Layer — Design Spec

**Task:** #1713 — Build chain abstraction layer (`src/lib/chains.js`)
**Goal:** Centralized chain registry module that all code references instead of hardcoded constants. Env-var-backed for multi-environment deployment.

---

## Architecture

A single module (`src/lib/chains.js`) that:
1. Defines structural metadata per chain (hardcoded — doesn't change per environment)
2. Loads deployment-specific values from environment variables
3. Validates all required env vars on first import (fail-fast)
4. Exports helper functions for chain lookup, address-based detection, and defaults

No code outside this module reads `process.env.CHAIN_*` directly.

---

## Chain Registry Shape

Each chain entry has this structure:

```js
{
  id: 'base',                    // hardcoded
  caip2: 'eip155:8453',          // hardcoded
  name: 'Base',                  // hardcoded
  addressFormat: 'evm',          // hardcoded ('evm' | 'casper')
  nftContract: '0x...',          // from env
  paymentToken: '0x...',         // from env
  treasury: '0x...',             // from env
  rpcUrl: 'https://...',         // from env
  explorer: 'https://...',       // from env
  x402Facilitator: 'https://...', // from env
  explorerTx: (hash) => `${explorer}/tx/${hash}`,   // derived
  marketplace: (contract, id) => `https://opensea.io/assets/base/${contract}/${id}` // derived
}
```

---

## Supported Chains

### Base (EVM)
- `id`: `'base'`
- `caip2`: `'eip155:8453'`
- `addressFormat`: `'evm'` — regex: `/^0x[0-9a-fA-F]{40}$/`
- `explorerTx`: `${explorer}/tx/${hash}`
- `marketplace`: `https://opensea.io/assets/base/${contract}/${id}`

### Casper
- `id`: `'casper'`
- `caip2`: `'casper:casper'`
- `addressFormat`: `'casper'` — regex: `/^(01|02)[0-9a-fA-F]{64}$/`
- `explorerTx`: `${explorer}/deploy/${hash}`
- `marketplace`: `null` (no NFT marketplace yet)

---

## Environment Variables

Per-chain variables follow the pattern `CHAIN_{UPPER_ID}_{FIELD}`:

```
CHAIN_BASE_NFT_CONTRACT=0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E
CHAIN_BASE_PAYMENT_TOKEN=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CHAIN_BASE_TREASURY=0x67439832C52C92B5ba8DE28a202E72D09CCEB42f
CHAIN_BASE_RPC_URL=https://mainnet.base.org
CHAIN_BASE_EXPLORER=https://basescan.org
CHAIN_BASE_X402_FACILITATOR=https://x402-facilitator.base.org

CHAIN_CASPER_NFT_CONTRACT=hash-placeholder
CHAIN_CASPER_PAYMENT_TOKEN=hash-placeholder
CHAIN_CASPER_TREASURY=02placeholder
CHAIN_CASPER_RPC_URL=https://rpc.mainnet.casperlabs.io/rpc
CHAIN_CASPER_EXPLORER=https://cspr.live
CHAIN_CASPER_X402_FACILITATOR=https://x402-facilitator.cspr.cloud

DEFAULT_CHAIN=base
```

All `CHAIN_{ID}_*` vars are required for each registered chain. Missing = thrown error at startup.

`DEFAULT_CHAIN` defaults to `'base'` if unset.

---

## Exported API

### `getChain(id: string) → ChainConfig`
Returns the full config object for the given chain ID. Throws `Error('Unknown chain: ${id}')` if not found.

### `getChainByAddress(address: string) → ChainConfig`
Detects chain from address format:
- `/^0x[0-9a-fA-F]{40}$/` → base
- `/^(01|02)[0-9a-fA-F]{64}$/` → casper
- Otherwise → throws `Error('Unrecognized address format: ${address}')`

### `getSupportedChains() → ChainConfig[]`
Returns array of all registered chain configs.

### `DEFAULT_CHAIN → ChainConfig`
The resolved default chain config object (based on `DEFAULT_CHAIN` env var).

---

## Startup Validation

On first import, the module:
1. Iterates all registered chain definitions
2. For each, reads the 6 required env vars
3. If any are missing/empty, throws immediately: `Error('Missing env var: CHAIN_BASE_NFT_CONTRACT')`
4. Constructs the full config objects
5. Resolves `DEFAULT_CHAIN`

This means: if your `.env.local` is incomplete, the app won't start. No silent nulls at request time.

---

## Acceptance Criteria

- [ ] `src/lib/chains.js` exports `getChain`, `getChainByAddress`, `getSupportedChains`, `DEFAULT_CHAIN`
- [ ] Base and Casper chain entries fully populated from env vars
- [ ] Address detection correctly routes EVM and Casper formats
- [ ] Missing env var throws descriptive error on module load
- [ ] Unit tests cover: valid lookups, unknown chain, address detection (both formats + invalid), missing env validation
- [ ] `.env.local` updated with all required `CHAIN_*` variables
- [ ] `npm run build` passes