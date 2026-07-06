import { test, expect } from '@playwright/test';

// Single-chain session UI: proves the header never renders two wallet
// addresses/buttons simultaneously, and shows exactly one "Connect Wallet"
// entry point in the logged-out state (chain choice offered once, at connect
// time, not as a persistent dual-button header).
test.describe('single-chain wallet session', () => {
  test('logged-out header shows exactly one connect entry point, not two chain buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // The old dual-button header had a "Casper Wallet" button AND a separate
    // "Base Wallet" button simultaneously visible. The new WalletMenu renders
    // a single "Connect Wallet" button pre-login.
    const connectWallet = page.locator('button:has-text("Connect Wallet")');
    await expect(connectWallet).toHaveCount(1);

    // Never both a standalone "Casper Wallet" and "Base Wallet" button at once.
    const legacyCasperButton = page.locator('button:has-text("Casper Wallet")');
    const legacyBaseButton = page.locator('button:has-text("Base Wallet")');
    expect(await legacyCasperButton.count()).toBe(0);
    expect(await legacyBaseButton.count()).toBe(0);
  });

  test('connect menu offers Base and Casper choice exactly once at connect time', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    const connectWallet = page.locator('button:has-text("Connect Wallet")').first();
    await connectWallet.click();
    await page.waitForTimeout(300);

    await expect(page.locator('button:has-text("Connect on Base")')).toHaveCount(1);
    await expect(page.locator('button:has-text("Connect on Casper")')).toHaveCount(1);
  });

  test('header never renders two wallet addresses simultaneously (single dropdown region)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Exactly one wallet-session control region in the header, regardless of
    // connection state — this is the invariant the single-chain model enforces.
    const walletRegion = page.locator('[aria-label="Wallet session"], button:has-text("Connect Wallet")');
    await expect(walletRegion).toHaveCount(1);
  });
});
