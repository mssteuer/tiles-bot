// Check domain availability via DNS (no whois needed)
// If DNS resolves = likely taken, if NXDOMAIN = likely available
import { promises as dns } from 'dns';

const candidates = [
  // Michael's suggestions
  'agentbook.ai', 'botbook.ai',
  
  // Million/Grid theme
  'millionbots.ai', 'millionbothomepage.com', 'millionagents.ai',
  'millionbots.com', 'millionagents.com',
  'thebotgrid.com', 'thebotgrid.ai',
  'agentgrid.ai', 'botgrid.ai', 'botgrid.com',
  
  // Book/Registry theme  
  'agentbook.com', 'botbook.com',
  'agentregistry.ai', 'agentpages.ai', 'botpages.ai',
  'agentdirectory.ai',
  
  // Wall/Canvas/Mosaic theme
  'agentwall.ai', 'agentwall.com',
  'botwall.ai', 'botwall.com',
  'agentmosaic.ai', 'botmosaic.ai',
  'agentcanvas.ai', 'botcanvas.ai',
  'theagentwall.com',
  
  // Pixel/Tile theme
  'agentpixels.ai', 'agentpixels.com',
  'agenttiles.ai', 'agenttiles.com',
  'bottiles.ai', 'bottiles.com',
  
  // Short/Catchy
  'botmap.ai', 'botmap.com',
  'agentmap.ai', 'agentmap.com',
  'botplot.ai', 'botplot.com',
  'agentplot.ai', 'agentplot.com',
  'claimyourtile.com', 'claimyourtile.ai',
  'tilebot.ai', 'tilemap.ai',
  
  // 256 / Computing theme
  'grid256.ai', 'grid256.com',
  '256grid.com', '256grid.ai',
  'the256.ai', 'the256.com',
  
  // x402 / Commerce angle
  'agentmarket.ai', 'botsquare.ai', 'botsquare.com',
  'agentsquare.ai', 'agentsquare.com',
  
  // Premium/Bold
  'everybot.ai', 'everyagent.ai',
  'allbots.ai', 'allagents.ai',
  'whobot.ai', 'whoisbot.ai',
  'botworld.ai', 'agentworld.ai',
  'onegrid.ai', 'thegrid.ai',
];

console.log('Domain Availability Check (DNS-based)\n');
console.log('🟢 = no DNS records (likely available)');
console.log('🔴 = has DNS records (likely taken)\n');

const available = [];
const taken = [];

for (const domain of candidates) {
  try {
    await dns.resolve(domain);
    taken.push(domain);
    process.stdout.write(`🔴 ${domain}\n`);
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
      available.push(domain);
      process.stdout.write(`🟢 ${domain}\n`);
    } else {
      process.stdout.write(`⚪ ${domain} (${err.code})\n`);
    }
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`SUMMARY: ${available.length} likely available, ${taken.length} likely taken`);
console.log(`${'═'.repeat(50)}\n`);

if (available.length > 0) {
  console.log('🟢 LIKELY AVAILABLE:');
  available.forEach(d => console.log(`   ${d}`));
}
