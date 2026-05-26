'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { ConnectKitProvider } from 'connectkit';
import { wagmiConfig } from '@/lib/wagmi';
import { CasperWalletProvider, CSPR_CLICK_OPTIONS } from '@/lib/casper-wallet';
import dynamic from 'next/dynamic';

const queryClient = new QueryClient();

// — ClickProvider is CSR-only (uses browser APIs, styled-components)
const CsprClickProvider = dynamic(
  () => import('@make-software/csprclick-ui').then((mod) => {
    const { ClickProvider } = mod;
    // Wrapper that passes options and renders children
    return function CsprClickWrapper({ children }) {
      return (
        <ClickProvider options={CSPR_CLICK_OPTIONS}>
          {children}
        </ClickProvider>
      );
    };
  }),
  { ssr: false }
);

export default function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          options={{
            enforceSupportedChains: true,
            hideBalance: true,
            walletConnectCTA: 'both',
            hideNoWalletCTA: false,
            hideQuestionMarkCTA: true,
            hideRecentBadge: true,
            reducedMotion: false,
            disclaimer: null,
            initialChainId: 0,
          }}
          customTheme={{
            '--ck-font-family': 'system-ui, -apple-system, sans-serif',
          }}
        >
          <CsprClickProvider>
            <CasperWalletProvider>
              {children}
            </CasperWalletProvider>
          </CsprClickProvider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
