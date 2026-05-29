/**
 * @tiles-bot/casper-x402-client
 *
 * Casper x402 client library — build and sign x402 payment headers
 * for the Casper network using EIP-712 typed data and Casper keys.
 */

// Types
export type {
  CasperPaymentRequirements,
  CasperPaymentPayload,
  CasperSigner,
  CasperKeyAlgorithm,
  CasperEIP712Domain,
  CasperNetwork,
  TransferAuthorizationMessage,
} from './types.js';

export {
  CASPER_MAINNET_NETWORK,
  CASPER_TESTNET_NETWORK,
} from './types.js';

// Signer
export {
  createCasperSigner,
  computeAccountHash,
  toHex,
  fromHex,
} from './signer.js';

// Client
export {
  createCasperPaymentHeader,
  createCasperEIP712Domain,
  buildTransferAuthorization,
  signTransferAuthorization,
  selectCasperPaymentRequirements,
} from './client.js';
