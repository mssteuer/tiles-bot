const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tiles-span-db-'));
process.env.DB_DIR = dbDir;

const {
  claimTile,
  getTile,
  getGridState,
  createTileSpan,
  getTileSpan,
  getTileSpanByTopLeft,
  getTileSpanForTile,
  getAllTileSpans,
  getRectTileIds,
  updateTileSpan,
  dissolveTileSpan,
} = require('../src/lib/db');

function run() {
  const ids = getRectTileIds(0, 2, 3, 256);
  assert.deepEqual(ids, [0, 1, 256, 257, 512, 513]);

  assert.equal(getRectTileIds(255, 2, 1, 256), null);
  assert.equal(getRectTileIds(65280, 1, 2, 256), null);
  assert.equal(getRectTileIds(0, 1, 1, 256), null);
  assert.equal(getRectTileIds(0, 17, 1, 256), null);
  assert.equal(getRectTileIds(0, 1, 17, 256), null);

  const owner = '0xabc0000000000000000000000000000000000001';
  const other = '0xabc0000000000000000000000000000000000002';
  const rectIds = [1000, 1001, 1256, 1257, 1512, 1513];
  for (const id of rectIds) claimTile(id, owner, 0.01);

  assert.throws(() => createTileSpan({ topLeftId: 1000, width: 1, height: 1, owner }), /at least 2 tiles/i);
  assert.throws(() => createTileSpan({ topLeftId: 1000, width: 17, height: 1, owner }), /between 1 and 16/i);

  claimTile(2000, other, 0.01);
  claimTile(2001, owner, 0.01);
  assert.throws(() => createTileSpan({ topLeftId: 2000, width: 2, height: 1, owner }), /same wallet/i);

  const span = createTileSpan({ topLeftId: 1000, width: 2, height: 3, owner });
  assert.equal(span.width, 2);
  assert.equal(span.height, 3);
  assert.equal(span.status, 'pending');
  assert.equal(span.tileIds.length, 6);

  const fetched = getTileSpanByTopLeft(1000);
  assert.equal(fetched.id, span.id);
  assert.equal(getTileSpanForTile(1513).id, span.id);
  assert.equal(getAllTileSpans().length, 0);
  assert.equal(getAllTileSpans({ includeNonReady: true }).length, 1);

  const updated = updateTileSpan(span.id, {
    imageUrl: '/tile-images/spans/1000/master.png',
    status: 'ready',
    sliceImageUrls: {
      1000: '/tile-images/1000.png',
      1001: '/tile-images/1001.png',
      1256: '/tile-images/1256.png',
      1257: '/tile-images/1257.png',
      1512: '/tile-images/1512.png',
      1513: '/tile-images/1513.png',
    },
  });

  assert.equal(updated.imageUrl, '/tile-images/spans/1000/master.png');
  assert.equal(updated.status, 'ready');
  assert.equal(updated.sliceImageUrls[1257], '/tile-images/1257.png');
  assert.equal(getTile(1257).imageUrl, '/tile-images/1257.png');

  const gridState = getGridState();
  assert.equal(gridState.spans.length, 1);
  assert.equal(gridState.spans[0].id, span.id);
  assert.equal(gridState.tiles[1000].spanId, span.id);

  const respan = createTileSpan({ topLeftId: 1001, width: 1, height: 2, owner });
  assert.equal(getTile(1001).spanId, respan.id);
  assert.equal(getTile(1257).spanId, respan.id);
  assert.equal(getTile(1000).spanId, span.id);
  assert.equal(getTile(1256).spanId, span.id);
  assert.equal(getTile(1512).spanId, span.id);
  assert.equal(getTile(1513).spanId, span.id);
  assert.deepEqual(getTileSpan(span.id).tileIds, [1000, 1256, 1512, 1513]);

  const dissolved = dissolveTileSpan(respan.id, owner);
  assert.equal(dissolved.id, respan.id);
  assert.equal(getTile(1001).spanId, null);
  assert.equal(getTile(1257).spanId, null);
  assert.equal(getTileSpan(respan.id), null);

  console.log('multitile spans node tests: ok');
}

run();
