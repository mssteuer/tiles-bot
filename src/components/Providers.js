'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { ConnectKitProvider } from 'connectkit';
import { wagmiConfig } from '@/lib/wagmi';

const queryClient = new QueryClient();

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
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
