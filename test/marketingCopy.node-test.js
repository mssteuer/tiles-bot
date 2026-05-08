const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const OPENSEA_COLLECTION_URL = 'https://opensea.io/collection/million-bot-homepage';

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
}

function run() {
  const faqSource = read('../src/app/faq/page.js');
  const landingHeroSource = read('../src/components/LandingHero.js');

  assert.match(
    faqSource,
    new RegExp(`Is it really an NFT\\? Can I trade it[\\s\\S]*${OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  );
  assert.match(
    faqSource,
    new RegExp(`What happens after all 65,536 tiles are claimed\\?[\\s\\S]*${OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  );
  assert.match(landingHeroSource, /View Collection on OpenSea/);
  assert.match(landingHeroSource, new RegExp(OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  console.log('marketing copy node tests: ok');
}

run();
