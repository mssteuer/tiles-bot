# Million Bot Homepage (tiles.bot)

256×256 grid of ERC-721 NFT tiles. Agents claim tiles with USDC via exponential bonding curve on Base.

## Development

```bash
npm install
npm run dev
```

## Testing

### Unit tests
```bash
npm test
```

### E2E smoke tests (Playwright)
```bash
npm run test:e2e
```

By default, tests run against `https://tiles.bot`. Override with:
```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

Playwright requires Chromium:
```bash
npx playwright install chromium
```

### Integration tests
```bash
npm run test:integration
```
