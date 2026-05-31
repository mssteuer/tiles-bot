const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CHAIN_VISUALS,
  getTileChainId,
  getChainVisual,
  tileMatchesChainFilter,
  buildChainExplorerLinks,
  formatAddressForChain,
} = require('../src/lib/chainVisuals');

describe('chain visual helpers', () => {
  it('maps claimed tiles to the requested chain border colors', () => {
    assert.equal(getChainVisual({ owner: '0xabc', chain: 'base' }).borderColor, CHAIN_VISUALS.base.borderColor);
    assert.equal(getChainVisual({ owner: '01abc', chain: 'casper' }).borderColor, CHAIN_VISUALS.casper.borderColor);
    assert.equal(getChainVisual({ id: 7 }).borderColor, null);
  });

  it('defaults legacy claimed tiles without chain metadata to Base', () => {
    assert.equal(getTileChainId({ owner: '0xabc' }), 'base');
    assert.equal(getTileChainId({ owner: '0xabc', chain: 'Casper' }), 'casper');
    assert.equal(getTileChainId({}), null);
  });

  it('filters claimed tiles by chain while all keeps every tile', () => {
    const baseTile = { owner: '0xabc', chain: 'base' };
    const casperTile = { owner: '01abc', chain: 'casper' };

    assert.equal(tileMatchesChainFilter(baseTile, 'all'), true);
    assert.equal(tileMatchesChainFilter(casperTile, 'All'), true);
    assert.equal(tileMatchesChainFilter(baseTile, 'base'), true);
    assert.equal(tileMatchesChainFilter(baseTile, 'casper'), false);
    assert.equal(tileMatchesChainFilter(casperTile, 'casper'), true);
  });

  it('builds chain-specific explorer links and marketplace links', () => {
    const baseLinks = buildChainExplorerLinks({
      tile: {
        id: 42,
        owner: '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f',
        txHash: '0xdeadbeef',
        chain: 'base',
      },
      chainConfig: {
        id: 'base',
        explorer: 'https://basescan.org',
        nftContract: '0xB2915C42329edFfC26037eed300D620C302b5791',
      },
    });

    assert.equal(baseLinks.ownerUrl, 'https://basescan.org/address/0x67439832C52C92B5ba8DE28a202E72D09CCEB42f');
    assert.equal(baseLinks.txUrl, 'https://basescan.org/tx/0xdeadbeef');
    assert.equal(baseLinks.contractUrl, 'https://basescan.org/address/0xB2915C42329edFfC26037eed300D620C302b5791');
    assert.equal(baseLinks.marketplaceUrl, 'https://opensea.io/assets/base/0xB2915C42329edFfC26037eed300D620C302b5791/42');

    const casperLinks = buildChainExplorerLinks({
      tile: {
        id: 43,
        owner: 'account-hash-abc123',
        txHash: 'deploy-hash-123',
        chain: 'casper',
        chainContract: 'hash-casper-nft',
      },
      chainConfig: {
        id: 'casper',
        explorer: 'https://cspr.live',
        nftContract: 'hash-fallback-nft',
      },
    });

    assert.equal(casperLinks.ownerUrl, 'https://cspr.live/account/account-hash-abc123');
    assert.equal(casperLinks.txUrl, 'https://cspr.live/deploy/deploy-hash-123');
    assert.equal(casperLinks.contractUrl, 'https://cspr.live/contract-package/hash-casper-nft');
    assert.equal(casperLinks.marketplaceUrl, null);
    assert.equal(casperLinks.contractAddress, 'hash-casper-nft');
  });

  it('truncates EVM and Casper/account-hash addresses without changing their format prefix', () => {
    assert.equal(formatAddressForChain('0x67439832C52C92B5ba8DE28a202E72D09CCEB42f', 'base'), '0x6743...B42f');
    assert.equal(formatAddressForChain('account-hash-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 'casper'), 'account-hash-abcdef...567890');
    assert.equal(formatAddressForChain('01abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 'casper'), '01abcd...567890');
  });
});
