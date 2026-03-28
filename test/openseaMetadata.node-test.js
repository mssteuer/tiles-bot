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

function run() {
  const claimed = buildTileTokenMetadata({
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

  assert.equal(claimed.name, 'Agent Zero');
  assert.equal(claimed.image, 'https://tiles.bot/uploads/123.png');
  assert.equal(claimed.external_url, 'https://tiles.bot/?tile=123');
  assert.ok(claimed.attributes.some((item) => item.trait_type === 'Category' && item.value === 'research'));
  assert.ok(claimed.attributes.some((item) => item.trait_type === 'Block Group' && item.value === '77'));
  assert.ok(claimed.attributes.some((item) => item.trait_type === 'X Coordinate' && item.value === 123));
  assert.ok(claimed.attributes.some((item) => item.trait_type === 'Y Coordinate' && item.value === 0));

  const unclaimed = buildTileTokenMetadata({
    siteUrl: 'https://tiles.bot',
    tileId: 511,
    tile: null,
  });

  assert.equal(unclaimed.name, 'Tile #511');
  assert.equal(unclaimed.image, 'https://tiles.bot/og-image.png');
  assert.ok(unclaimed.attributes.some((item) => item.trait_type === 'Tile Number' && item.value === 511));
  assert.ok(unclaimed.attributes.some((item) => item.trait_type === 'X Coordinate' && item.value === 255));
  assert.ok(unclaimed.attributes.some((item) => item.trait_type === 'Y Coordinate' && item.value === 1));

  const collection = buildCollectionMetadata({
    siteUrl: 'https://tiles.bot',
  });

  assert.equal(collection.name, 'tiles.bot');
  assert.equal(collection.image, 'https://tiles.bot/og-image.png');
  assert.equal(collection.external_link, 'https://tiles.bot');
  assert.equal(collection.seller_fee_basis_points, 0);
  assert.equal(collection.fee_recipient, '0x0000000000000000000000000000000000000000');

  assert.equal(
    buildOpenSeaAssetUrl({
      contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
      tileId: 42,
      chainId: '8453',
    }),
    'https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42'
  );

  assert.equal(
    buildOpenSeaSellUrl({
      contractAddress: '0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E',
      tileId: 42,
      chainId: '8453',
    }),
    'https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/42/sell'
  );

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

  const functionNames = contractArtifact.abi
    .filter((entry) => entry.type === 'function')
    .map((entry) => entry.name);

  assert.ok(functionNames.includes('setBaseMetadataURI'));
  assert.ok(functionNames.includes('tokenURI'));

  console.log('opensea metadata node tests: ok');
}

run();
