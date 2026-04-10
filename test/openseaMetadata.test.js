const assert = require('node:assert/strict');
const contractArtifact = require('../artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json');

const {
  buildTileTokenMetadata,
  buildCollectionMetadata,
  buildOpenSeaAssetUrl,
  buildOpenSeaSellUrl,
  getOpenSeaNetworkLabel,
  isMainnetChain,
} = require('../src/lib/openseaMetadata.cjs');

describe('OpenSea metadata helpers', function () {
  describe('buildTileTokenMetadata', function () {
    it('builds ERC-721 metadata JSON for a claimed tile with image and attributes', function () {
      const metadata = buildTileTokenMetadata({
        siteUrl: 'https://tiles.bot',
        tileId: 123,
        tile: {
          id: 123,
          name: 'Agent Zero',
          description: 'Claims the first good tile.',
          avatar: '🤖',
          category: 'research',
          color: '#ff6600',
          status: 'online',
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          url: 'https://agent.zero',
          xHandle: 'agentzero',
          spanId: 77,
          imageUrl: '/uploads/123.png',
          claimedAt: '2026-03-27T00:00:00.000Z',
        },
      });

      assert.equal(metadata.name, 'Million Bot Tile #123 — Agent Zero');
      assert.match(metadata.description, /Claims the first good tile\./);
      assert.equal(metadata.image, 'https://tiles.bot/uploads/123.png');
      assert.equal(metadata.external_url, 'https://tiles.bot/?tile=123');
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Category' && item.value === 'research'));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Status' && item.value === 'online'));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'X Handle' && item.value === '@agentzero'));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Block Group' && item.value === '77'));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Row' && item.value === 0));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Column' && item.value === 123));
    });

    it('builds fallback metadata for an unclaimed tile', function () {
      const metadata = buildTileTokenMetadata({
        siteUrl: 'https://tiles.bot',
        tileId: 511,
        tile: null,
      });

      assert.equal(metadata.name, 'Million Bot Tile #511');
      assert.equal(metadata.image, 'https://tiles.bot/og-image.png');
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Claimed' && item.value === 'No'));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Row' && item.value === 1));
      assert.ok(metadata.attributes.some((item) => item.trait_type === 'Column' && item.value === 255));
    });
  });

  describe('buildCollectionMetadata', function () {
    it('builds OpenSea collection metadata', function () {
      const metadata = buildCollectionMetadata({
        siteUrl: 'https://tiles.bot',
      });

      assert.equal(metadata.name, 'tiles.bot');
      assert.match(metadata.description, /256×256 canvas of NFT tiles/);
      assert.equal(metadata.image, 'https://tiles.bot/og-image.png');
      assert.equal(metadata.external_link, 'https://tiles.bot');
      assert.equal(metadata.seller_fee_basis_points, 250);
      assert.equal(metadata.fee_recipient, '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f');
    });
  });

  describe('OpenSea links', function () {
    it('builds mainnet OpenSea asset URLs', function () {
      assert.equal(
        buildOpenSeaAssetUrl({
          contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
          tileId: 42,
          chainId: '8453',
        }),
        'https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42'
      );
    });

    it('builds a dedicated OpenSea sell URL instead of duplicating the asset URL', function () {
      assert.equal(
        buildOpenSeaSellUrl({
          contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
          tileId: 42,
          chainId: '8453',
        }),
        'https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42/sell'
      );
    });

    it('builds testnet OpenSea asset URLs without gating buttons away', function () {
      assert.equal(
        buildOpenSeaAssetUrl({
          contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
          tileId: 42,
          chainId: '84532',
        }),
        'https://testnets.opensea.io/assets/base_sepolia/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42'
      );
      assert.equal(getOpenSeaNetworkLabel('84532'), 'Base Sepolia');
      assert.equal(isMainnetChain('84532'), false);
    });
  });

  describe('contract ABI readiness', function () {
    it('includes the metadata functions required for OpenSea integration prep', function () {
      const functionNames = contractArtifact.abi
        .filter((entry) => entry.type === 'function')
        .map((entry) => entry.name);

      assert.ok(functionNames.includes('setBaseMetadataURI'));
      assert.ok(functionNames.includes('tokenURI'));
    });
  });
});
