const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const routeSource = readFileSync(join(ROOT, 'src/app/api/tiles/[id]/image/route.js'), 'utf8');
const nextConfigSource = readFileSync(join(ROOT, 'next.config.js'), 'utf8');

assert.match(
  routeSource,
  /function imagePath\(\.\.\.segments\)/,
  'tile image route should use a scoped imagePath helper instead of broad path.join tracing',
);

assert.match(
  routeSource,
  /const IMAGES_DIR = process\.env\.IMAGES_DIR \|\| `\$\{process\.cwd\(\)\}\/public\/tile-images`/,
  'default image directory should stay under public/tile-images',
);

assert.match(
  routeSource,
  /filePath:\s*imagePath\(IMAGES_DIR,\s*filename\)/,
  'tile image file paths should preserve runtime IMAGES_DIR behavior',
);

assert.doesNotMatch(
  routeSource,
  /path\.join\(IMAGES_DIR|path\.join\(process\.cwd\(\)/,
  'image route should not use broad path.join patterns that Turbopack traces from project root',
);

assert.match(
  routeSource,
  /imageUrl:\s*`\/tile-images\/\$\{filename\}`/,
  'public tile image URL should remain stable',
);

assert.match(
  nextConfigSource,
  /outputFileTracingExcludes:\s*{\s*'\/\*':\s*\['\.\/next\.config\.js'\]/s,
  'next.config.js should be excluded from runtime file traces',
);

console.log('tile image route source tests: ok');
