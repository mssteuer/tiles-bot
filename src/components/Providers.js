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
  () => import('@make-software/csprclick-ui').then(async (mod) => {
    const { ClickProvider, ClickUI, CsprClickThemes } = mod;
    const { ThemeProvider } = await import('styled-components');
    // Wrapper that passes options, renders children, and mounts CSPR.click's modal UI.
    return function CsprClickWrapper({ children }) {
      return (
        <ThemeProvider theme={CsprClickThemes.dark}>
          <ClickProvider options={CSPR_CLICK_OPTIONS}>
            {children}
            <ClickUI themeMode="dark" rootAppElement="body" />
          </ClickProvider>
        </ThemeProvider>
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
