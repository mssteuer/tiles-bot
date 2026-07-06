const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveActiveChain, chainToDisconnect, STORAGE_KEY } = require('../src/lib/sessionChain');

describe('resolveActiveChain', () => {
  it('returns null when neither chain is connected', () => {
    assert.equal(resolveActiveChain({ baseConnected: false, casperConnected: false, storedChain: null }), null);
  });

  it('returns base when only base is connected', () => {
    assert.equal(resolveActiveChain({ baseConnected: true, casperConnected: false, storedChain: null }), 'base');
  });

  it('returns casper when only casper is connected', () => {
    assert.equal(resolveActiveChain({ baseConnected: false, casperConnected: true, storedChain: null }), 'casper');
  });

  it('when both connected and stored chain was base, switches to casper (newly connected wins)', () => {
    assert.equal(resolveActiveChain({ baseConnected: true, casperConnected: true, storedChain: 'base' }), 'casper');
  });

  it('when both connected and stored chain was casper, switches to base (newly connected wins)', () => {
    assert.equal(resolveActiveChain({ baseConnected: true, casperConnected: true, storedChain: 'casper' }), 'base');
  });

  it('when both connected and no prior stored chain, defaults to base', () => {
    assert.equal(resolveActiveChain({ baseConnected: true, casperConnected: true, storedChain: null }), 'base');
  });
});

describe('chainToDisconnect', () => {
  it('returns null when not both connected', () => {
    assert.equal(chainToDisconnect({ baseConnected: true, casperConnected: false, activeChain: 'base' }), null);
    assert.equal(chainToDisconnect({ baseConnected: false, casperConnected: true, activeChain: 'casper' }), null);
    assert.equal(chainToDisconnect({ baseConnected: false, casperConnected: false, activeChain: null }), null);
  });

  it('returns casper to disconnect when active chain is base and both connected', () => {
    assert.equal(chainToDisconnect({ baseConnected: true, casperConnected: true, activeChain: 'base' }), 'casper');
  });

  it('returns base to disconnect when active chain is casper and both connected', () => {
    assert.equal(chainToDisconnect({ baseConnected: true, casperConnected: true, activeChain: 'casper' }), 'base');
  });
});

describe('STORAGE_KEY', () => {
  it('is a stable non-empty string', () => {
    assert.equal(typeof STORAGE_KEY, 'string');
    assert.ok(STORAGE_KEY.length > 0);
  });
});
