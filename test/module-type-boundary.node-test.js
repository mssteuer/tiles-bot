const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('Node module type boundary', () => {
  it('keeps the root package CommonJS-compatible for existing node:test and Hardhat files', () => {
    assert.notEqual(
      packageJson.type,
      'module',
      'Do not set root type=module until CommonJS tests, Hardhat config, and scripts are migrated to .cjs/.mjs boundaries.'
    );
  });

  it('suppresses only Node typeless package warnings in canonical test and build scripts', () => {
    const warningFlag = '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON';

    assert.match(packageJson.scripts.test, new RegExp(warningFlag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(packageJson.scripts.build, new RegExp(warningFlag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
