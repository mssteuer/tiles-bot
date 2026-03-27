# Task #475 — Fix Wallet Connection + Disconnect/Switch Account UI

## Problem
1. MetaMask connection fails silently — clicking "Connect Wallet" opens RainbowKit modal but MetaMask doesn't complete the connection
2. No way to disconnect or switch accounts once connected — wallet address shows but there's no logout/switch button

## Root Cause Investigation Required
Before implementing, check:
- Is `wagmi` config using correct chain (Base mainnet, chainId 8453)?
- Is `RainbowKit` configured with `getDefaultConfig` or `createConfig`?
- Are `WagmiProvider` and `RainbowKitProvider` in the correct nesting order in `src/app/layout.js`?
- Is `QueryClientProvider` (from `@tanstack/react-query`) present — wagmi v2 requires it?
- Any console errors when MetaMask connect is attempted?
- Check `src/lib/wagmi.js` for the chains and connectors config

## Required Fix: MetaMask Connection
- Ensure wagmi v2 config uses `http()` transport for Base mainnet
- Required providers in layout.js (in this exact nesting order):
  ```jsx
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider>
        {children}
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
  ```
- Chains config must include `base` from `wagmi/chains`
- Connectors: use RainbowKit's `getDefaultWallets` which includes MetaMask injected connector

## Required Feature: Disconnect + Switch Account
When a wallet IS connected, the header "Connect Wallet" button should change to show:
- The connected address (truncated: `0xABCD...1234`)
- A dropdown/popover on click with:
  - "Switch Wallet" — re-opens the RainbowKit modal
  - "Disconnect" — calls `disconnect()` from wagmi and clears connection
  - The current chain name ("Base") and a colored dot (green = correct chain, red = wrong chain)

Use RainbowKit's built-in `<ConnectButton>` component — it handles all of the above automatically including the connected state UI, disconnect, and network switching. Replace the custom "Connect Wallet" button in `src/components/Header.js` with `<ConnectButton>` from `@rainbow-me/rainbowkit`.

## Implementation

### src/lib/wagmi.js
```js
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'tiles.bot',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  chains: [base],
  ssr: true,
});
```

### src/components/Providers.js
```jsx
'use client';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { wagmiConfig } from '../lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

export function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### src/app/layout.js
- Import `Providers` and wrap `{children}` with `<Providers>`
- Must be a server component at top level with `Providers` as a client boundary

### src/components/Header.js
- Import `ConnectButton` from `@rainbow-me/rainbowkit`
- Replace current custom wallet button with `<ConnectButton />`
- RainbowKit ConnectButton automatically shows: address when connected, disconnect option, network switcher, chain badge

### src/components/ClaimModal.js
- Remove any custom wallet connection logic — use `useAccount()` from wagmi to read connection state
- If `!isConnected`: show ConnectButton
- If `isConnected`: proceed to claim flow

## Dependencies to Verify Installed
```bash
npm list @rainbow-me/rainbowkit @wagmi/core wagmi viem @tanstack/react-query
```
All should be present. If `@tanstack/react-query` is missing: `npm install @tanstack/react-query`.

## Acceptance Criteria
- [ ] MetaMask: clicking "Connect Wallet" → RainbowKit modal opens → MetaMask prompts for approval → wallet address appears in header
- [ ] Coinbase Wallet connector works
- [ ] WalletConnect QR code connector works
- [ ] When connected: header shows truncated address (e.g. `0xABCD...1234`)
- [ ] Clicking address shows dropdown with Disconnect option
- [ ] "Disconnect" clears the connection, header reverts to "Connect Wallet"
- [ ] "Switch Wallet" re-opens connector modal
- [ ] Wrong network (not Base): shows red "Wrong Network" badge, prompts switch
- [ ] ClaimModal: "Connect Wallet" inside modal works same as header button
- [ ] `npm run build` passes with zero errors and zero warnings about missing providers
- [ ] Browser console shows no React provider nesting errors

## Browser QA Steps
1. Open https://tiles.bot in browser tool
2. Take screenshot to confirm current state
3. Click "Connect Wallet" — verify MetaMask prompt appears
4. Confirm connection — verify address shows in header
5. Click address — verify dropdown with Disconnect
6. Click Disconnect — verify resets to "Connect Wallet"
7. Screenshot final state
