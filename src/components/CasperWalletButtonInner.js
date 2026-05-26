'use client';

import React, { useEffect, useRef } from 'react';
import { useClickRef } from '@make-software/csprclick-ui';
import { useCasperWallet } from '@/lib/casper-wallet';

export default function CasperWalletButtonInner() {
  const clickRef = useClickRef();
  const { isConnected, truncatedKey, signOut, attachListeners } = useCasperWallet();
  const listenersAttached = useRef(false);

  useEffect(() => {
    if (clickRef && !listenersAttached.current) {
      attachListeners(clickRef);
      listenersAttached.current = true;
    }
  }, [clickRef, attachListeners]);

  const handleClick = () => {
    if (isConnected) {
      signOut();
    } else if (clickRef) {
      clickRef.signIn();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`btn-retro px-[14px] py-1.5 text-[12px] ${isConnected ? '' : 'btn-retro-casper'}`}
      title={isConnected ? 'Disconnect Casper wallet' : 'Connect Casper wallet'}
    >
      {isConnected ? `🔴 ${truncatedKey}` : '🔴 Casper Wallet'}
    </button>
  );
}
