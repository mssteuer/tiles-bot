'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useCasperWallet } from '@/lib/casper-wallet';
import { resolveActiveChain, chainToDisconnect, STORAGE_KEY } from '@/lib/sessionChain';

/**
 * Single-chain session hook. Wraps the Base (wagmi) and Casper (CSPR.click)
 * wallet states and enforces: only ONE chain may be "active" at a time.
 *
 * If a user connects the second chain while already connected to the first,
 * the newly-connected chain becomes active and the previous chain's wallet
 * is disconnected automatically (no dual-address UI ever renders).
 *
 * Active chain choice is persisted to localStorage so a page reload keeps
 * showing the same single-chain session instead of re-resolving from scratch.
 */
export function useWalletSession() {
  const { address: baseAddress, isConnected: baseConnected } = useAccount();
  const { disconnect: disconnectBase } = useDisconnect();
  const {
    publicKey: casperPublicKey,
    truncatedKey: casperTruncatedKey,
    isConnected: casperConnected,
    signIn: connectCasper,
    switchAccount: switchCasperAccount,
    signOut: disconnectCasper,
  } = useCasperWallet();

  const [storedChain, setStoredChain] = useState(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setStoredChain(window.localStorage.getItem(STORAGE_KEY));
    hydratedRef.current = true;
  }, []);

  const activeChain = useMemo(
    () => resolveActiveChain({ baseConnected, casperConnected, storedChain }),
    [baseConnected, casperConnected, storedChain]
  );

  // Persist whenever the resolved active chain changes.
  useEffect(() => {
    if (!hydratedRef.current || typeof window === 'undefined') return;
    if (activeChain) window.localStorage.setItem(STORAGE_KEY, activeChain);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [activeChain]);

  // Enforce single-chain: if both got connected, disconnect the loser.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const toDrop = chainToDisconnect({ baseConnected, casperConnected, activeChain });
    if (toDrop === 'base') disconnectBase();
    else if (toDrop === 'casper') disconnectCasper();
  }, [baseConnected, casperConnected, activeChain, disconnectBase, disconnectCasper]);

  const address = activeChain === 'casper' ? casperPublicKey : activeChain === 'base' ? baseAddress : null;
  const truncated = activeChain === 'casper' ? casperTruncatedKey
    : (baseAddress ? `${baseAddress.slice(0, 6)}...${baseAddress.slice(-4)}` : null);

  function logOut() {
    if (activeChain === 'base') disconnectBase();
    else if (activeChain === 'casper') disconnectCasper();
  }

  function switchAccount() {
    if (activeChain === 'casper') switchCasperAccount();
    // Base account switching happens inside MetaMask itself; nothing to trigger here.
  }

  return {
    activeChain,
    address,
    truncatedAddress: truncated,
    isConnected: !!activeChain,
    connectCasper,
    switchAccount,
    logOut,
  };
}
