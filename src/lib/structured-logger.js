/**
 * Structured JSON logger for operational error visibility.
 * All output goes to stderr so it does not pollute API responses.
 * No private keys or sensitive data should ever be passed to these functions.
 */

/**
 * Emit a structured JSON log line to stderr.
 * @param {object} fields - Log fields (merged with timestamp).
 */
function logJson(fields) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...fields,
  });
  process.stderr.write(line + '\n');
}

/**
 * Log a failed x402 payment attempt.
 * @param {object} opts
 * @param {number|string} opts.tileId
 * @param {string} opts.wallet
 * @param {string} opts.errorCode
 * @param {string} opts.errorMessage
 */
export function logX402Failure({ tileId, wallet, errorCode, errorMessage }) {
  logJson({
    level: 'error',
    event: 'x402_payment_failed',
    tileId,
    wallet,
    errorCode: errorCode || 'UNKNOWN',
    errorMessage: errorMessage || 'unknown error',
  });
}

/**
 * Log a failed on-chain mint transaction.
 * @param {object} opts
 * @param {number|string} opts.tileId
 * @param {string} [opts.wallet]
 * @param {string} [opts.txHash]
 * @param {string} opts.errorMessage
 */
export function logMintFailure({ tileId, wallet, txHash, errorMessage }) {
  logJson({
    level: 'error',
    event: 'mint_failed',
    tileId,
    wallet: wallet || null,
    txHash: txHash || null,
    errorMessage: errorMessage || 'unknown error',
  });
}

/**
 * Log a chain sync error.
 * @param {object} opts
 * @param {string} opts.errorMessage
 * @param {string} [opts.detail]
 * @param {string} [opts.context]
 */
export function logChainSyncError({ errorMessage, detail, context }) {
  logJson({
    level: 'error',
    event: 'chain_sync_error',
    context: context || 'sync-chain',
    errorMessage: errorMessage || 'unknown error',
    detail: detail || null,
  });
}

/**
 * Log a failed on-chain ownership verification (register endpoint).
 * @param {object} opts
 * @param {number|string} opts.tileId
 * @param {string} opts.wallet
 * @param {string} [opts.txHash]
 * @param {string} opts.errorMessage
 */
export function logRegisterVerificationFailure({ tileId, wallet, txHash, errorMessage }) {
  logJson({
    level: 'error',
    event: 'register_verification_failed',
    tileId,
    wallet,
    txHash: txHash || null,
    errorMessage: errorMessage || 'unknown error',
  });
}
