import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getTileSpan, getTileSpanForTile, updateTileSpan } from '@/lib/db';
import { isFilebaseConfigured, uploadToFilebase } from '@/lib/filebase';
import { broadcast } from '@/lib/sse-broadcast';

const TILE_STORAGE_SIZE = 512;
const MAX_UPLOAD_DIMENSION = 4096;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SPAN_IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'public', 'tile-images');

function parseBodyFields(formData) {
  const spanId = parseInt(formData.get('spanId'), 10);
  const topLeftId = parseInt(formData.get('topLeftId'), 10);
  const width = parseInt(formData.get('width'), 10);
  const height = parseInt(formData.get('height'), 10);
  return { spanId, topLeftId, width, height };
}

function getSpanDir(span) {
  return path.join(SPAN_IMAGES_DIR, 'spans', String(span.id));
}

function fitRectCanvas(image, targetWidth, targetHeight) {
  return image.resize(targetWidth, targetHeight, {
    fit: 'contain',
    position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
}

export async function POST(request, { params }) {
  const { id: rawId } = await params;
  const urlId = parseInt(rawId, 10);
  if (isNaN(urlId)) {
    return NextResponse.json({ error: 'Invalid span identifier' }, { status: 400 });
  }

  const wallet = request.headers.get('x-wallet') || request.headers.get('x-address');
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('image');
  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const imageBuffer = Buffer.from(bytes);
  if (imageBuffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 });
  }

  const fields = parseBodyFields(formData);
  let span = null;
  if (!isNaN(fields.spanId)) span = getTileSpan(fields.spanId);
  if (!span && !isNaN(fields.topLeftId)) span = getTileSpanForTile(fields.topLeftId);
  if (!span) span = getTileSpan(urlId);

  if (!span) {
    return NextResponse.json({ error: 'Span not found' }, { status: 404 });
  }

  if (span.owner.toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let metadata;
  let masterBuffer;

  try {
    const image = sharp(imageBuffer, { failOn: 'error' });
    metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ error: 'Could not read image dimensions' }, { status: 400 });
    }
    if (metadata.width > MAX_UPLOAD_DIMENSION || metadata.height > MAX_UPLOAD_DIMENSION) {
      return NextResponse.json({
        error: `Image dimensions too large (max ${MAX_UPLOAD_DIMENSION}×${MAX_UPLOAD_DIMENSION})`,
      }, { status: 413 });
    }

    masterBuffer = await fitRectCanvas(
      image,
      span.width * TILE_STORAGE_SIZE,
      span.height * TILE_STORAGE_SIZE,
    ).png().toBuffer();
  } catch {
    return NextResponse.json({ error: 'Invalid image format. Use PNG, JPG, or WebP.' }, { status: 400 });
  }

  const spanDir = getSpanDir(span);
  if (!existsSync(spanDir)) {
    await mkdir(spanDir, { recursive: true });
  }

  const masterLocalPath = path.join(spanDir, 'master.png');
  const masterLocalUrl = `/tile-images/spans/${span.id}/master.png`;
  await writeFile(masterLocalPath, masterBuffer);

  const sliceImageUrls = {};
  const tileSliceResults = [];

  for (let row = 0; row < span.height; row++) {
    for (let col = 0; col < span.width; col++) {
      const tileId = span.tileIds[row * span.width + col];
      const sliceBuffer = await sharp(masterBuffer)
        .extract({
          left: col * TILE_STORAGE_SIZE,
          top: row * TILE_STORAGE_SIZE,
          width: TILE_STORAGE_SIZE,
          height: TILE_STORAGE_SIZE,
        })
        .png()
        .toBuffer();

      const tileFilename = `${tileId}.png`;
      const tileLocalPath = path.join(SPAN_IMAGES_DIR, tileFilename);
      const tileLocalUrl = `/tile-images/${tileFilename}`;
      if (!existsSync(SPAN_IMAGES_DIR)) {
        await mkdir(SPAN_IMAGES_DIR, { recursive: true });
      }
      await writeFile(tileLocalPath, sliceBuffer);
      sliceImageUrls[tileId] = tileLocalUrl;
      tileSliceResults.push({ tileId, imageUrl: tileLocalUrl });
    }
  }

  let ipfs = null;
  if (isFilebaseConfigured()) {
    try {
      ipfs = await uploadToFilebase(masterBuffer, `tile-spans/${span.id}/master.png`, 'image/png');
    } catch (err) {
      console.error(`[span-image] Filebase upload failed for span ${span.id}:`, err.message);
    }
  }

  const updated = updateTileSpan(span.id, {
    imageUrl: ipfs?.gateway || masterLocalUrl,
    sliceImageUrls,
  });

  try {
    broadcast({ type: 'span_updated', spanId: updated.id, topLeftId: updated.topLeftId });
  } catch {}

  return NextResponse.json({
    ok: true,
    span: updated,
    imageUrl: updated.imageUrl,
    slices: tileSliceResults,
    original: { width: metadata.width, height: metadata.height },
    stored: { width: span.width * TILE_STORAGE_SIZE, height: span.height * TILE_STORAGE_SIZE, format: 'png' },
  });
}
