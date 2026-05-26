'use client';

import React, { useEffect } from 'react';
import { useCasperWallet } from '@/lib/casper-wallet';
import dynamic from 'next/dynamic';

// — Inner component that uses useClickRef (must be inside ClickProvider)
const CasperWalletButtonInner = dynamic(
  () => import('./CasperWalletButtonInner'),
  { ssr: false, loading: () => <CasperButtonPlaceholder /> }
);

function CasperButtonPlaceholder() {
  return (
    <button
      disabled
      className="btn-retro px-[14px] py-1.5 text-[12px] opacity-50"
    >
      🔴 Casper
    </button>
  );
}

export default function CasperWalletButton() {
  return <CasperWalletButtonInner />;
}
