import { NextResponse } from 'next/server';
import { getTile, updateTileMetadata } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'public', 'tile-images');
const IMAGE_SIZE = 256; // pixels — square crop
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request, { params }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id) || id < 0 || id >= 65536) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(id);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  // Auth: wallet must match owner
  const wallet = request.headers.get('x-wallet') || request.headers.get('x-address');
  if (!wallet || wallet.toLowerCase() !== tile.owner.toLowerCase()) {
    // Allow demo-seed-wallet for seeded tiles
    if (tile.owner !== 'demo-seed-wallet') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let imageBuffer;
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    // Form upload
    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    const bytes = await file.arrayBuffer();
    imageBuffer = Buffer.from(bytes);
  } else if (contentType.includes('application/json')) {
    // Base64 upload (for agents)
    const body = await request.json();
    if (!body.image) return NextResponse.json({ error: 'No image in body' }, { status: 400 });
    // Strip data URL prefix if present
    const base64 = body.image.replace(/^data:image\/[a-z]+;base64,/, '');
    imageBuffer = Buffer.from(base64, 'base64');
  } else {
    // Raw binary upload
    const bytes = await request.arrayBuffer();
    imageBuffer = Buffer.from(bytes);
  }

  if (imageBuffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 413 });
  }

  // Process with sharp: auto-detect format, crop to square, resize to 256x256
  let processedBuffer;
  try {
    processedBuffer = await sharp(imageBuffer)
      .resize(IMAGE_SIZE, IMAGE_SIZE, {
        fit: 'cover',      // crop to fill square
        position: 'centre',
      })
      .png()               // normalize to PNG
      .toBuffer();
  } catch (err) {
    return NextResponse.json({ error: 'Invalid image format. Use PNG, JPG, or WebP.' }, { status: 400 });
  }

  // Save to public/tile-images/{id}.png
  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }
  const filename = `${id}.png`;
  await writeFile(path.join(IMAGES_DIR, filename), processedBuffer);

  // Update tile record with image URL
  const imageUrl = `/tile-images/${filename}`;
  updateTileMetadata(id, { imageUrl });

  return NextResponse.json({ ok: true, imageUrl });
}

export async function GET(request, { params }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id) || id < 0 || id >= 65536) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(id);
  if (!tile || !tile.imageUrl) {
    return NextResponse.json({ error: 'No image for this tile' }, { status: 404 });
  }

  return NextResponse.json({ imageUrl: tile.imageUrl });
}
