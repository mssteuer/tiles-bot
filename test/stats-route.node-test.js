const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function run() {
  const statsPagePath = path.join(ROOT, 'src/app/stats/page.js');
  assert.ok(fs.existsSync(statsPagePath), '/stats app route exists');

  const statsPage = read('src/app/stats/page.js');
  assert.match(
    statsPage,
    /import\s+AnalyticsPage\s+from\s+['"]\.\.\/admin\/analytics\/page['"]/, 
    '/stats imports the public analytics dashboard',
  );
  assert.match(
    statsPage,
    /return\s+<AnalyticsPage\s*\/>/, 
    '/stats renders analytics instead of falling through to 404',
  );

  const header = read('src/components/Header.js');
  assert.match(header, /href:\s*['"]\/admin\/analytics['"][\s\S]*label:\s*['"]Stats['"]/, 'existing Stats nav still targets analytics dashboard');

  console.log('stats route source tests: ok');
}

run();
