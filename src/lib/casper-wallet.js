'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CONTENT_MODE } from '@make-software/csprclick-core-types';

// — CSPR.click SDK configuration

const IS_TESTNET = process.env.NEXT_PUBLIC_CASPER_NETWORK === 'casper-test';

export const CSPR_CLICK_OPTIONS = {
  appName: 'tiles.bot',
  appId: process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID || '',
  contentMode: CONTENT_MODE.IFRAME,
  providers: [
    'casper-wallet',
    'ledger',
    'metamask-snap',
    'walletconnect',
    'csprclick-w3a-google',
    'csprclick-w3a-apple',
  ],
  chainName: IS_TESTNET ? 'casper-test' : 'casper',
};

// — Casper wallet context

const CasperWalletContext = createContext({
  activeAccount: null,
  isConnected: false,
  publicKey: null,
  truncatedKey: null,
  signIn: () => {},
  signOut: () => {},
});

export function useCasperWallet() {
  return useContext(CasperWalletContext);
}

// — Truncate a Casper public key for display (e.g. 01ab...cdef)
function truncatePublicKey(key) {
  if (!key || key.length < 12) return key || '';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// — Provider component that wraps ClickProvider and manages Casper wallet state

export function CasperWalletProvider({ children }) {
  const [activeAccount, setActiveAccount] = useState(null);
  const clickRef = useRef(null);

  const handleSignedIn = useCallback((evt) => {
    if (evt?.account) {
      setActiveAccount(evt.account);
    }
  }, []);

  const handleSwitchedAccount = useCallback((evt) => {
    if (evt?.account) {
      setActiveAccount(evt.account);
    }
  }, []);

  const handleDisconnected = useCallback(() => {
    setActiveAccount(null);
  }, []);

  const handleSignedOut = useCallback(() => {
    setActiveAccount(null);
  }, []);

  // Attach event listeners once ClickProvider's SDK is available
  const attachListeners = useCallback((ref) => {
    if (!ref) return;
    clickRef.current = ref;
    ref.on('csprclick:signed_in', handleSignedIn);
    ref.on('csprclick:switched_account', handleSwitchedAccount);
    ref.on('csprclick:disconnected', handleDisconnected);
    ref.on('csprclick:signed_out', handleSignedOut);
  }, [handleSignedIn, handleSwitchedAccount, handleDisconnected, handleSignedOut]);

  const signIn = useCallback(() => {
    if (clickRef.current) {
      clickRef.current.signIn();
    }
  }, []);

  const signOut = useCallback(() => {
    if (clickRef.current) {
      clickRef.current.signOut();
    }
    setActiveAccount(null);
  }, []);

  const publicKey = activeAccount?.public_key || null;

  const value = {
    activeAccount,
    isConnected: !!activeAccount,
    publicKey,
    truncatedKey: truncatePublicKey(publicKey),
    signIn,
    signOut,
    attachListeners,
  };

  return (
    <CasperWalletContext.Provider value={value}>
      {children}
    </CasperWalletContext.Provider>
  );
}
