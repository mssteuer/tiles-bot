'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useClickRef } from '@make-software/csprclick-ui';
import { useCasperWallet } from '@/lib/casper-wallet';

export default function CasperWalletButtonInner() {
  const clickRef = useClickRef();
  const { isConnected, truncatedKey, signIn, switchAccount, signOut, attachListeners } = useCasperWallet();
  const listenersAttached = useRef(false);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (clickRef && !listenersAttached.current) {
      attachListeners(clickRef);
      listenersAttached.current = true;
    }
  }, [clickRef, attachListeners]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  if (!isConnected) {
    return (
      <button
        onClick={signIn}
        className="btn-retro btn-retro-casper px-[14px] py-1.5 text-[12px]"
        title="Connect Casper wallet"
      >
        🔴 Casper Wallet
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        onClick={() => setMenuOpen(open => !open)}
        className="btn-retro px-[14px] py-1.5 text-[12px]"
        title="Casper wallet menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        🔴 {truncatedKey} ▾
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-50 mt-2 min-w-[180px] rounded-[3px] border border-border bg-surface-2 p-1.5 shadow-lg" role="menu">
          <button
            onClick={() => { setMenuOpen(false); switchAccount(); }}
            className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-text hover:bg-surface"
            role="menuitem"
          >
            Switch account
          </button>
          <button
            onClick={() => { setMenuOpen(false); signOut(); }}
            className="block w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-red-300 hover:bg-surface"
            role="menuitem"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
