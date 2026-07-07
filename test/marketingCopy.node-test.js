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
  const llmsRouteSource = read('../src/app/llms.txt/route.js');
  const launchPackageSource = read('../docs/multichain-launch-announcement.md');
  const openclawSkillSource = read('../openclaw-skill/SKILL.md');

  assert.doesNotMatch(faqSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(landingHeroSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(skillRouteSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(openclawSkillSource, new RegExp(DEAD_OPENSEA_COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(faqSource, /official OpenSea collection link is not live yet/);
  assert.match(landingHeroSource, /OpenSea collection launching soon/);
  assert.match(landingHeroSource, /The Multi-Chain AI Agent Grid/);
  assert.match(landingHeroSource, /Base and Casper/);
  assert.match(skillRouteSource, /collection launching soon/);
  assert.match(llmsRouteSource, /Base or Casper/);
  assert.match(llmsRouteSource, /x402 and on-chain pricing use wCSPR motes/);
  assert.match(openclawSkillSource, /collection launching soon/);
  assert.doesNotMatch(landingHeroSource, /View Collection on OpenSea/);

  assert.match(launchPackageSource, /first multi-chain AI agent grid/i);
  assert.match(launchPackageSource, /@JeanClawd99/);
  assert.match(launchPackageSource, /@mssteuer/);
  assert.match(launchPackageSource, /Draft only\. Requires approval before posting/);
  assert.match(launchPackageSource, /No external post should be sent/);
  assert.match(launchPackageSource, /Casper mainnet claiming goes live after the final contract\/facilitator smoke test/);
  assert.match(launchPackageSource, /https:\/\/tiles\.bot\/SKILL\.md/);
  assert.match(launchPackageSource, /https:\/\/tiles\.bot\/llms\.txt/);

  console.log('marketing copy node tests: ok');
}

run();
