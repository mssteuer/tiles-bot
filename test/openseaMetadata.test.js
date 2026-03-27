const { expect } = require('chai');

const {
  buildTileTokenMetadata,
  buildCollectionMetadata,
  buildOpenSeaAssetUrl,
  getOpenSeaNetworkLabel,
  isMainnetChain,
} = require('../src/lib/openseaMetadata.cjs');

describe('OpenSea metadata helpers', function () {
  describe('buildTileTokenMetadata', function () {
    it('builds ERC-721 metadata JSON for a claimed tile with image and attributes', function () {
      const metadata = buildTileTokenMetadata({
        siteUrl: 'https://tiles.bot',
        contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
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
          imageUrl: '/uploads/123.png',
          claimedAt: '2026-03-27T00:00:00.000Z',
        },
      });

      expect(metadata.name).to.equal('Million Bot Tile #123 — Agent Zero');
      expect(metadata.description).to.include('Claims the first good tile.');
      expect(metadata.image).to.equal('https://tiles.bot/uploads/123.png');
      expect(metadata.external_url).to.equal('https://tiles.bot/?tile=123');
      expect(metadata.attributes).to.deep.include({ trait_type: 'Category', value: 'research' });
      expect(metadata.attributes).to.deep.include({ trait_type: 'Status', value: 'online' });
      expect(metadata.attributes).to.deep.include({ trait_type: 'X Handle', value: '@agentzero' });
      expect(metadata.attributes).to.deep.include({ trait_type: 'Row', value: 0 });
      expect(metadata.attributes).to.deep.include({ trait_type: 'Column', value: 123 });
    });

    it('builds fallback metadata for an unclaimed tile', function () {
      const metadata = buildTileTokenMetadata({
        siteUrl: 'https://tiles.bot',
        contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
        tileId: 511,
        tile: null,
      });

      expect(metadata.name).to.equal('Million Bot Tile #511');
      expect(metadata.image).to.equal('https://tiles.bot/og-image.png');
      expect(metadata.attributes).to.deep.include({ trait_type: 'Claimed', value: 'No' });
      expect(metadata.attributes).to.deep.include({ trait_type: 'Row', value: 1 });
      expect(metadata.attributes).to.deep.include({ trait_type: 'Column', value: 255 });
    });
  });

  describe('buildCollectionMetadata', function () {
    it('builds OpenSea collection metadata', function () {
      const metadata = buildCollectionMetadata({
        siteUrl: 'https://tiles.bot',
        contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
      });

      expect(metadata.name).to.equal('tiles.bot');
      expect(metadata.description).to.include('256×256 canvas of NFT tiles');
      expect(metadata.image).to.equal('https://tiles.bot/og-image.png');
      expect(metadata.external_link).to.equal('https://tiles.bot');
      expect(metadata.seller_fee_basis_points).to.equal(0);
      expect(metadata.fee_recipient).to.equal('0x0000000000000000000000000000000000000000');
    });
  });

  describe('OpenSea links', function () {
    it('builds mainnet OpenSea asset URLs', function () {
      expect(
        buildOpenSeaAssetUrl({
          contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
          tileId: 42,
          chainId: '8453',
        })
      ).to.equal('https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42');
    });

    it('builds testnet OpenSea asset URLs without gating buttons away', function () {
      expect(
        buildOpenSeaAssetUrl({
          contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
          tileId: 42,
          chainId: '84532',
        })
      ).to.equal('https://testnets.opensea.io/assets/base_sepolia/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42');
      expect(getOpenSeaNetworkLabel('84532')).to.equal('Base Sepolia');
      expect(isMainnetChain('84532')).to.equal(false);
    });
  });
});
