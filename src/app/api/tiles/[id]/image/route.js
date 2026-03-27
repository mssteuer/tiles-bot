import { NextResponse } from 'next/server';
import { getTile, updateTileMetadata } from '@/lib/db';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'public', 'tile-images');
const STORAGE_SIZE = 512;
const MAX_UPLOAD_DIMENSION = 2048;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_SIZES = new Set([64, 128, 256, 512]);

function getImagePaths(id) {
  const filename = `${id}.png`;
  return {
    filename,
    filePath: path.join(IMAGES_DIR, filename),
    imageUrl: `/tile-images/${filename}`,
  };
}

function parseRequestedSize(request) {
  const { searchParams } = new URL(request.url);
  const rawSize = searchParams.get('size');

  if (!rawSize) return STORAGE_SIZE;

  const size = parseInt(rawSize, 10);
  if (!ALLOWED_SIZES.has(size)) return null;
  return size;
}

export async function POST(request, { params }) {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
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
    if (tile.owner !== 'demo-seed-wallet') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let imageBuffer;
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    const bytes = await file.arrayBuffer();
    imageBuffer = Buffer.from(bytes);
  } else if (contentType.includes('application/json')) {
    const body = await request.json();
    if (!body.image) return NextResponse.json({ error: 'No image in body' }, { status: 400 });
    const base64 = body.image.replace(/^data:image\/[a-z]+;base64,/, '');
    imageBuffer = Buffer.from(base64, 'base64');
  } else {
    const bytes = await request.arrayBuffer();
    imageBuffer = Buffer.from(bytes);
  }

  if (imageBuffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 413 });
  }

  let metadata;
  let processedBuffer;

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

    processedBuffer = await image
      .resize(STORAGE_SIZE, STORAGE_SIZE, {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'Invalid image format. Use PNG, JPG, or WebP.' }, { status: 400 });
  }

  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }

  const { filePath, imageUrl } = getImagePaths(id);
  await writeFile(filePath, processedBuffer);
  updateTileMetadata(id, { imageUrl });

  return NextResponse.json({
    ok: true,
    imageUrl,
    sizes: {
      default: `${imageUrl}?size=512`,
      grid: `${imageUrl}?size=64`,
      panel: `${imageUrl}?size=256`,
      download: `${imageUrl}?size=512`,
    },
    original: {
      width: metadata.width,
      height: metadata.height,
    },
    stored: {
      width: STORAGE_SIZE,
      height: STORAGE_SIZE,
      format: 'png',
    },
  });
}

export async function GET(request, { params }) {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id) || id < 0 || id >= 65536) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(id);
  if (!tile || !tile.imageUrl) {
    return NextResponse.json({ error: 'No image for this tile' }, { status: 404 });
  }

  const requestedSize = parseRequestedSize(request);
  if (!requestedSize) {
    return NextResponse.json({ error: 'Invalid size. Use one of: 64, 128, 256, 512' }, { status: 400 });
  }

  const { filePath, imageUrl } = getImagePaths(id);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Image file not found' }, { status: 404 });
  }

  const fileBuffer = await readFile(filePath);
  const outputBuffer = requestedSize === STORAGE_SIZE
    ? fileBuffer
    : await sharp(fileBuffer)
        .resize(requestedSize, requestedSize, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();

  return new NextResponse(outputBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=60',
      'X-Image-Size': String(requestedSize),
      'X-Image-Source': imageUrl,
    },
  });
}
