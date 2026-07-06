'use client';

import { useEffect, useRef, useState } from 'react';
import { useModal } from 'connectkit';
import { useWalletSession } from '@/lib/useWalletSession';

/**
 * Single wallet menu — replaces the old dual "Casper Wallet" + "Base Wallet"
 * buttons in the header. Renders:
 *   - Logged out: one "Connect Wallet" button that offers the chain choice
 *     (Base or Casper) exactly once, at connect time.
 *   - Logged in: ONE address shown as a dropdown with log out, switch
 *     account, and view on block explorer (chain-correct via /api/chains).
 */
export default function WalletMenu() {
  const { activeChain, address, truncatedAddress, isConnected, connectCasper, switchAccount, logOut } = useWalletSession();
  const { setOpen: openBaseConnectModal } = useModal();

  const [chainPicking, setChainPicking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [explorerBase, setExplorerBase] = useState(null);
  const menuRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!isConnected || !activeChain) return;
    let cancelled = false;
    fetch('/api/chains')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const chain = data?.chains?.[activeChain];
        if (chain?.explorer && chain?.explorerAddressPattern) {
          setExplorerBase(`${chain.explorer}${chain.explorerAddressPattern}`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isConnected, activeChain]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!chainPicking) return;
    const close = (event) => {
      if (!pickerRef.current?.contains(event.target)) setChainPicking(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [chainPicking]);

  if (!isConnected) {
    return (
      <div ref={pickerRef} className="relative inline-block">
        <button
          onClick={() => setChainPicking(open => !open)}
          className="btn-retro btn-retro-primary px-[14px] py-1.5 text-[12px]"
          aria-haspopup="menu"
          aria-expanded={chainPicking}
        >
          Connect Wallet
        </button>
        {chainPicking && (
          <div className="absolute right-0 z-50 mt-2 min-w-[180px] rounded-[3px] border border-border bg-surface-2 p-1.5 shadow-lg" role="menu" aria-label="Chain choice">
            <button
              onClick={() => { setChainPicking(false); openBaseConnectModal(true); }}
              className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-text hover:bg-surface"
              role="menuitem"
            >
              🔵 Connect on Base
            </button>
            <button
              onClick={() => { setChainPicking(false); connectCasper(); }}
              className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-text hover:bg-surface"
              role="menuitem"
            >
              🔴 Connect on Casper
            </button>
          </div>
        )}
      </div>
    );
  }

  const badge = activeChain === 'casper' ? '🔴' : '🔵';
  const explorerUrl = explorerBase && address ? `${explorerBase}${address}` : null;
  const explorerLabel = activeChain === 'casper' ? 'cspr.live' : 'BaseScan';

  return (
    <div ref={menuRef} className="relative inline-block" aria-label="Wallet session">
      <button
        onClick={() => setMenuOpen(open => !open)}
        className="btn-retro px-[14px] py-1.5 text-[12px]"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {badge} {truncatedAddress} ▾
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-50 mt-2 min-w-[200px] rounded-[3px] border border-border bg-surface-2 p-1.5 shadow-lg" role="menu">
          {activeChain === 'casper' && (
            <button
              onClick={() => { setMenuOpen(false); switchAccount(); }}
              className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-text hover:bg-surface"
              role="menuitem"
            >
              Switch account
            </button>
          )}
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-text hover:bg-surface no-underline"
              role="menuitem"
            >
              View on {explorerLabel}
            </a>
          )}
          <button
            onClick={() => { setMenuOpen(false); logOut(); }}
            className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-red-300 hover:bg-surface"
            role="menuitem"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
