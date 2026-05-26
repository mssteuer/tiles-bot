# Chain Abstraction Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/chains.js` — a centralized, env-var-backed chain registry that all code references for chain-specific config.

**Architecture:** Single module loads chain metadata from env vars at startup, validates completeness, and exports lookup helpers. Structural metadata (caip2, name, format) is hardcoded; deployment values (addresses, URLs) come from environment.

**Tech Stack:** Plain JavaScript (Node.js built-in `node:test` + `node:assert` for unit tests)

---

## File Structure

| File | Purpose |
|------|---------|
| `src/lib/chains.js` | Chain registry module — config loading, validation, exports |
| `test/chains.test.js` | Unit tests for all registry functionality |
| `.env.local` | Add CHAIN_* variables (existing file, append) |

---

### Task 1: Set up test file and write failing tests for getChain

**Files:**
- Create: `test/chains.test.js`

- [ ] **Step 1: Create the test file with getChain tests**

```js
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Set required env vars before importing the module
function setTestEnv() {
  process.env.CHAIN_BASE_NFT_CONTRACT = '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E'
  process.env.CHAIN_BASE_PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f'
  process.env.CHAIN_BASE_RPC_URL = 'https://mainnet.base.org'
  process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org'
  process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402-facilitator.base.org'
  process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-placeholder'
  process.env.CHAIN_CASPER_PAYMENT_TOKEN = 'hash-placeholder'
  process.env.CHAIN_CASPER_TREASURY = '02placeholder'
  process.env.CHAIN_CASPER_RPC_URL = 'https://rpc.mainnet.casperlabs.io/rpc'
  process.env.CHAIN_CASPER_EXPLORER = 'https://cspr.live'
  process.env.CHAIN_CASPER_X402_FACILITATOR = 'https://x402-facilitator.cspr.cloud'
  process.env.DEFAULT_CHAIN = 'base'
}

setTestEnv()

const { getChain, getChainByAddress, getSupportedChains, DEFAULT_CHAIN } = await import('../src/lib/chains.js')

describe('getChain', () => {
  it('returns Base config for id "base"', () => {
    const chain = getChain('base')
    assert.equal(chain.id, 'base')
    assert.equal(chain.caip2, 'eip155:8453')
    assert.equal(chain.name, 'Base')
    assert.equal(chain.addressFormat, 'evm')
    assert.equal(chain.nftContract, '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E')
    assert.equal(chain.paymentToken, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    assert.equal(chain.treasury, '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f')
    assert.equal(chain.rpcUrl, 'https://mainnet.base.org')
    assert.equal(chain.explorer, 'https://basescan.org')
    assert.equal(chain.x402Facilitator, 'https://x402-facilitator.base.org')
  })

  it('returns Casper config for id "casper"', () => {
    const chain = getChain('casper')
    assert.equal(chain.id, 'casper')
    assert.equal(chain.caip2, 'casper:casper')
    assert.equal(chain.name, 'Casper')
    assert.equal(chain.addressFormat, 'casper')
    assert.equal(chain.nftContract, 'hash-placeholder')
    assert.equal(chain.rpcUrl, 'https://rpc.mainnet.casperlabs.io/rpc')
  })

  it('throws for unknown chain id', () => {
    assert.throws(() => getChain('solana'), /Unknown chain: solana/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/chains.test.js`
Expected: FAIL — cannot find module `../src/lib/chains.js`

---

### Task 2: Implement core registry with env loading and validation

**Files:**
- Create: `src/lib/chains.js`

- [ ] **Step 1: Implement the chains module**

```js
// — Chain Abstraction Layer
// Centralized registry: structural metadata + env-var-loaded deployment config.
// All chain-specific lookups go through this module.

const CHAIN_DEFINITIONS = [
  {
    id: 'base',
    caip2: 'eip155:8453',
    name: 'Base',
    addressFormat: 'evm',
    explorerTxPattern: '/tx/',
    marketplace: (contract, tokenId) => `https://opensea.io/assets/base/${contract}/${tokenId}`
  },
  {
    id: 'casper',
    caip2: 'casper:casper',
    name: 'Casper',
    addressFormat: 'casper',
    explorerTxPattern: '/deploy/',
    marketplace: null
  }
]

const ENV_FIELDS = ['NFT_CONTRACT', 'PAYMENT_TOKEN', 'TREASURY', 'RPC_URL', 'EXPLORER', 'X402_FACILITATOR']

function loadChainEnv(chainId) {
  const prefix = `CHAIN_${chainId.toUpperCase()}_`
  const env = {}
  for (const field of ENV_FIELDS) {
    const varName = `${prefix}${field}`
    const value = process.env[varName]
    if (!value) {
      throw new Error(`Missing env var: ${varName}`)
    }
    env[field] = value
  }
  return env
}

function buildChainConfig(definition) {
  const env = loadChainEnv(definition.id)
  return {
    id: definition.id,
    caip2: definition.caip2,
    name: definition.name,
    addressFormat: definition.addressFormat,
    nftContract: env.NFT_CONTRACT,
    paymentToken: env.PAYMENT_TOKEN,
    treasury: env.TREASURY,
    rpcUrl: env.RPC_URL,
    explorer: env.EXPLORER,
    x402Facilitator: env.X402_FACILITATOR,
    explorerTx: (hash) => `${env.EXPLORER}${definition.explorerTxPattern}${hash}`,
    marketplace: definition.marketplace
  }
}

// — Build registry on import (fail-fast validation)
const registry = new Map()
for (const def of CHAIN_DEFINITIONS) {
  registry.set(def.id, buildChainConfig(def))
}

// — Resolve default chain
const defaultChainId = process.env.DEFAULT_CHAIN || 'base'
if (!registry.has(defaultChainId)) {
  throw new Error(`DEFAULT_CHAIN "${defaultChainId}" is not a registered chain`)
}

// — Address format detection
const ADDRESS_PATTERNS = [
  { format: 'evm', regex: /^0x[0-9a-fA-F]{40}$/ },
  { format: 'casper', regex: /^(01|02)[0-9a-fA-F]{64}$/ }
]

export function getChain(id) {
  const chain = registry.get(id)
  if (!chain) {
    throw new Error(`Unknown chain: ${id}`)
  }
  return chain
}

export function getChainByAddress(address) {
  for (const { format, regex } of ADDRESS_PATTERNS) {
    if (regex.test(address)) {
      const match = [...registry.values()].find(c => c.addressFormat === format)
      if (match) return match
    }
  }
  throw new Error(`Unrecognized address format: ${address}`)
}

export function getSupportedChains() {
  return [...registry.values()]
}

export const DEFAULT_CHAIN = registry.get(defaultChainId)
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --test test/chains.test.js`
Expected: All 3 tests in `getChain` describe block pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/chains.js test/chains.test.js
git commit -m "feat: add chain abstraction layer with Base and Casper support"
```

---

### Task 3: Add tests for getChainByAddress

**Files:**
- Modify: `test/chains.test.js`

- [ ] **Step 1: Add address detection tests to the test file**

Append after the `getChain` describe block:

```js
describe('getChainByAddress', () => {
  it('detects EVM address as Base', () => {
    const chain = getChainByAddress('0x67439832C52C92B5ba8DE28a202E72D09CCEB42f')
    assert.equal(chain.id, 'base')
  })

  it('detects Casper ed25519 address (01 prefix)', () => {
    const addr = '01' + 'a'.repeat(64)
    const chain = getChainByAddress(addr)
    assert.equal(chain.id, 'casper')
  })

  it('detects Casper secp256k1 address (02 prefix)', () => {
    const addr = '02' + 'b'.repeat(64)
    const chain = getChainByAddress(addr)
    assert.equal(chain.id, 'casper')
  })

  it('throws for invalid address', () => {
    assert.throws(() => getChainByAddress('not-an-address'), /Unrecognized address format/)
  })

  it('throws for EVM address with wrong length', () => {
    assert.throws(() => getChainByAddress('0x1234'), /Unrecognized address format/)
  })

  it('throws for Casper address with wrong prefix', () => {
    const addr = '03' + 'a'.repeat(64)
    assert.throws(() => getChainByAddress(addr), /Unrecognized address format/)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --test test/chains.test.js`
Expected: All 9 tests pass (3 getChain + 6 getChainByAddress).

- [ ] **Step 3: Commit**

```bash
git add test/chains.test.js
git commit -m "test: add address detection tests for chain registry"
```

---

### Task 4: Add tests for getSupportedChains, DEFAULT_CHAIN, and explorerTx

**Files:**
- Modify: `test/chains.test.js`

- [ ] **Step 1: Add remaining tests**

Append after the `getChainByAddress` describe block:

```js
describe('getSupportedChains', () => {
  it('returns array of all chains', () => {
    const chains = getSupportedChains()
    assert.equal(Array.isArray(chains), true)
    assert.equal(chains.length, 2)
    const ids = chains.map(c => c.id).sort()
    assert.deepEqual(ids, ['base', 'casper'])
  })
})

describe('DEFAULT_CHAIN', () => {
  it('resolves to base by default', () => {
    assert.equal(DEFAULT_CHAIN.id, 'base')
  })
})

describe('explorerTx', () => {
  it('builds Base explorer tx URL', () => {
    const chain = getChain('base')
    const url = chain.explorerTx('0xabc123')
    assert.equal(url, 'https://basescan.org/tx/0xabc123')
  })

  it('builds Casper explorer deploy URL', () => {
    const chain = getChain('casper')
    const url = chain.explorerTx('abc123')
    assert.equal(url, 'https://cspr.live/deploy/abc123')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --test test/chains.test.js`
Expected: All 13 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/chains.test.js
git commit -m "test: add getSupportedChains, DEFAULT_CHAIN, and explorerTx tests"
```

---

### Task 5: Add startup validation test

**Files:**
- Create: `test/chains-validation.test.js`

This needs a separate file because it tests module-load-time behavior with missing env vars, requiring a clean import.

- [ ] **Step 1: Create validation test file**

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('chains.js startup validation', () => {
  it('throws when a required env var is missing', async () => {
    // Clear all CHAIN_ env vars
    const savedEnv = { ...process.env }
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CHAIN_') || key === 'DEFAULT_CHAIN') {
        delete process.env[key]
      }
    }

    // Set partial env (missing CHAIN_BASE_PAYMENT_TOKEN)
    process.env.CHAIN_BASE_NFT_CONTRACT = '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E'
    process.env.CHAIN_BASE_RPC_URL = 'https://mainnet.base.org'
    process.env.CHAIN_BASE_EXPLORER = 'https://basescan.org'
    process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f'
    process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402-facilitator.base.org'
    // Deliberately NOT setting CHAIN_BASE_PAYMENT_TOKEN

    await assert.rejects(
      () => import(`../src/lib/chains.js?cacheBust=${Date.now()}`),
      (err) => {
        assert.match(err.message, /Missing env var: CHAIN_BASE_PAYMENT_TOKEN/)
        return true
      }
    )

    // Restore env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CHAIN_') || key === 'DEFAULT_CHAIN') {
        delete process.env[key]
      }
    }
    Object.assign(process.env, savedEnv)
  })
})
```

- [ ] **Step 2: Run validation tests**

Run: `node --test test/chains-validation.test.js`
Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add test/chains-validation.test.js
git commit -m "test: add startup validation test for missing env vars"
```

---

### Task 6: Update .env.local with CHAIN_* variables

**Files:**
- Modify: `.env.local` (append new variables)

- [ ] **Step 1: Append chain env vars to .env.local**

Add the following block to the end of `.env.local`:

```
# — Chain Registry
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

- [ ] **Step 2: Verify .env.local is gitignored**

Run: `git check-ignore .env.local`
Expected: `.env.local` is listed (already gitignored per project rules).

- [ ] **Step 3: No commit** (`.env.local` is gitignored — this is a local-only change)

---

### Task 7: Verify full build passes

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `node --test test/chains.test.js test/chains-validation.test.js`
Expected: All 14 tests pass, exit code 0.

- [ ] **Step 2: Run Next.js build**

Run: `npm run build`
Expected: Build succeeds with exit code 0. The new module isn't imported by any page yet, so no impact on build.

- [ ] **Step 3: Final commit (if any uncommitted test tweaks)**

```bash
git status
# If clean, nothing to do. If changes exist:
git add test/
git commit -m "chore: finalize chain abstraction tests"
```