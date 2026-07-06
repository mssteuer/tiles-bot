// — Single-chain session model
// Pure resolution logic for enforcing "login Casper OR Base, never both".
// No React/browser deps here so this can be unit tested with `node --test`.

const STORAGE_KEY = 'tiles_active_chain';

/**
 * Given the raw connection state of both wallet providers plus whichever chain
 * was previously the active session (persisted across reloads), decide which
 * single chain should be considered "active" right now.
 *
 * Rule: if only one wallet is connected, that's the active chain. If BOTH are
 * connected (e.g. the user just connected the chain they weren't previously
 * on), the NEWLY connected chain wins and replaces the old one — never both.
 */
function resolveActiveChain({ baseConnected, casperConnected, storedChain }) {
  if (baseConnected && casperConnected) {
    if (storedChain === 'base') return 'casper';
    if (storedChain === 'casper') return 'base';
    return 'base';
  }
  if (baseConnected) return 'base';
  if (casperConnected) return 'casper';
  return null;
}

/**
 * When both chains are simultaneously connected, returns which chain's wallet
 * should be disconnected to restore the single-chain invariant (the loser is
 * always the chain that is NOT the resolved active chain).
 */
function chainToDisconnect({ baseConnected, casperConnected, activeChain }) {
  if (baseConnected && casperConnected) {
    return activeChain === 'base' ? 'casper' : 'base';
  }
  return null;
}

module.exports = { STORAGE_KEY, resolveActiveChain, chainToDisconnect };
