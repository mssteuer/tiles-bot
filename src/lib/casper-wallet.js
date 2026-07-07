'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CONTENT_MODE } from '@make-software/csprclick-core-types';

// — CSPR.click SDK configuration

const IS_TESTNET = process.env.NEXT_PUBLIC_CASPER_NETWORK === 'casper-test';

export const CSPR_CLICK_OPTIONS = {
  appName: 'tiles.bot',
  appId: process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID || '',
  // IFRAME (the SDK default) serves /v2.0/index.html which is live. The legacy
  // 'popup' mode hits accounts.cspr.click/signin.html — decommissioned in the
  // CSPR.click v2 backend → 404 + blank popup + no wallet list. Pin it
  // explicitly so a future SDK default change can't silently reintroduce popup.
  contentMode: CONTENT_MODE.IFRAME,
  // CSPR.click UI reads app config menu_items with .map(); the production app
  // config can omit it, so pass an explicit empty menu to avoid undefined.map crashes.
  menuItems: [],
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
  switchAccount: () => {},
  signOut: () => {},
  getClickRef: () => null,
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

function accountFromEvent(evt) {
  return evt?.account || evt?.detail?.account || evt?.data?.account || evt?.[0]?.account || null;
}

export function CasperWalletProvider({ children }) {
  const [activeAccount, setActiveAccount] = useState(null);
  const clickRef = useRef(null);
  const attachedRef = useRef(null);

  const setAccountFromEvent = useCallback((evt) => {
    const account = accountFromEvent(evt);
    if (account) setActiveAccount(account);
  }, []);

  const handleDisconnected = useCallback(() => {
    setActiveAccount(null);
  }, []);

  const handleSignedOut = useCallback(() => {
    setActiveAccount(null);
  }, []);

  // Attach event listeners once ClickProvider's SDK is available.
  // CSPR.click exposes Node-style on/off listeners; detach from any stale ref to avoid duplicate updates.
  const attachListeners = useCallback((ref) => {
    if (!ref) return;
    if (attachedRef.current === ref) return;

    if (attachedRef.current?.off) {
      attachedRef.current.off('csprclick:signed_in', setAccountFromEvent);
      attachedRef.current.off('csprclick:switched_account', setAccountFromEvent);
      attachedRef.current.off('csprclick:unsolicited_account_change', setAccountFromEvent);
      attachedRef.current.off('csprclick:disconnected', handleDisconnected);
      attachedRef.current.off('csprclick:signed_out', handleSignedOut);
    }

    clickRef.current = ref;
    attachedRef.current = ref;
    ref.on('csprclick:signed_in', setAccountFromEvent);
    ref.on('csprclick:switched_account', setAccountFromEvent);
    ref.on('csprclick:unsolicited_account_change', setAccountFromEvent);
    ref.on('csprclick:disconnected', handleDisconnected);
    ref.on('csprclick:signed_out', handleSignedOut);

    const existing = ref.getActiveAccount?.();
    if (existing) setActiveAccount(existing);
    else ref.getActiveAccountAsync?.().then(account => {
      if (account) setActiveAccount(account);
    }).catch(() => {});
  }, [setAccountFromEvent, handleDisconnected, handleSignedOut]);

  const signIn = useCallback(() => {
    clickRef.current?.signIn?.();
  }, []);

  const switchAccount = useCallback(() => {
    const ref = clickRef.current;
    const provider = activeAccount?.provider;
    if (provider && ref?.switchAccount) ref.switchAccount(provider);
    else ref?.signIn?.();
  }, [activeAccount?.provider]);

  const signOut = useCallback(() => {
    clickRef.current?.signOut?.();
    setActiveAccount(null);
  }, []);

  const getClickRef = useCallback(() => clickRef.current, []);

  const publicKey = activeAccount?.public_key || null;

  const value = {
    activeAccount,
    isConnected: !!activeAccount,
    publicKey,
    truncatedKey: truncatePublicKey(publicKey),
    signIn,
    switchAccount,
    signOut,
    getClickRef,
    attachListeners,
  };

  return (
    <CasperWalletContext.Provider value={value}>
      {children}
    </CasperWalletContext.Provider>
  );
}
