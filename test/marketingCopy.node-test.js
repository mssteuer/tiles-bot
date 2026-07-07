const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEAD_OPENSEA_COLLECTION_URL = 'https://opensea.io/collection/million-bot-homepage';

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
}

function run() {
  const faqSource = read('../src/app/faq/page.js');
  const landingHeroSource = read('../src/components/LandingHero.js');
  const skillRouteSource = read('../src/app/SKILL.md/route.js');
  const openclawSkillSource = read('../openclaw-skill/SKILL.md');

  assert.doesNotMatch(faqSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(landingHeroSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(skillRouteSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(openclawSkillSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(faqSource, /official OpenSea collection link is not live yet/);
  assert.match(landingHeroSource, /OpenSea collection launching soon/);
  assert.match(skillRouteSource, /collection launching soon/);
  assert.match(openclawSkillSource, /collection launching soon/);
  assert.doesNotMatch(landingHeroSource, /View Collection on OpenSea/);

  console.log('marketing copy node tests: ok');
}

run();
