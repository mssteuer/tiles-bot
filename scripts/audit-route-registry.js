#!/usr/bin/env node
/**
 * Route Registry Audit — CI check
 *
 * Verifies that every route.js file in src/app/api/ has a corresponding entry
 * in src/lib/route-registry.js.
 *
 * Exit code 0 = all routes registered
 * Exit code 1 = one or more routes missing from registry
 *
 * Usage:
 *   node scripts/audit-route-registry.js
 */

import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const API_DIR = join(ROOT, 'src', 'app', 'api');

// Load registry (use dynamic import to handle ESM)
const { ROUTE_REGISTRY } = await import('../src/lib/route-registry.js');

// Build set of registered paths (strip /api prefix for file tree comparison)
const registeredPaths = new Set(ROUTE_REGISTRY.map(r => r.path));

// Walk the api directory and collect all route.js files
async function walk(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, results);
    } else if (entry.name === 'route.js') {
      results.push(fullPath);
    }
  }
  return results;
}

const routeFiles = await walk(API_DIR);

// Convert file path to URL path: /api/tiles/{id}/claim (OpenAPI-style, {param})
function fileToUrlPath(filePath) {
  const rel = relative(API_DIR, filePath);
  const dir = rel.replace(/\/route\.js$/, '');
  // Convert Next.js [param] to OpenAPI {param}
  return '/api/' + dir.replace(/\\/g, '/').replace(/\[([^\]]+)\]/g, '{$1}');
}

// Check each file
const missing = [];
for (const file of routeFiles) {
  const urlPath = fileToUrlPath(file);
  // A route file may have multiple methods — we just need at least one entry
  const hasEntry = ROUTE_REGISTRY.some(r => r.path === urlPath);
  if (!hasEntry) {
    missing.push(urlPath);
  }
}

if (missing.length === 0) {
  console.log(`✅ All ${routeFiles.length} route files are registered in route-registry.js`);
  process.exit(0);
} else {
  console.error(`❌ ${missing.length} route(s) missing from src/lib/route-registry.js:\n`);
  missing.forEach(p => console.error(`  ${p}`));
  console.error(`\nAdd entries to src/lib/route-registry.js for the paths above.`);
  process.exit(1);
}
