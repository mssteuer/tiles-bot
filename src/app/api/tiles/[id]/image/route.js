import { NextResponse } from 'next/server';
import { getTile, updateTileMetadata, logEvent } from '@/lib/db';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { isFilebaseConfigured, uploadToFilebase } from '@/lib/filebase';
import { broadcast } from '@/lib/sse-broadcast';

// Increase body size limit from default 1MB to 10MB
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

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

  // Auth: wallet must match owner (or smart wallet proxy)
  const wallet = request.headers.get('x-wallet') || request.headers.get('x-address');
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized — x-wallet header required' }, { status: 401 });
  }
  // Smart wallet: EOA differs from on-chain owner proxy — accept if either matches
  const walletLower = wallet.toLowerCase();
  const ownerLower = tile.owner.toLowerCase();
  if (walletLower !== ownerLower) {
    // Check on-chain ownership as fallback (Coinbase Smart Wallet proxy)
    try {
      const { createPublicClient, http: viemHttp } = await import('viem');
      const { base } = await import('viem/chains');
      const { parseAbi } = await import('viem');
      const pc = createPublicClient({ chain: base, transport: viemHttp('https://mainnet.base.org') });
      const onChainOwner = await pc.readContract({
        address: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
        abi: parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']),
        functionName: 'ownerOf', args: [BigInt(id)],
      });
      if (onChainOwner.toLowerCase() !== walletLower && onChainOwner.toLowerCase() !== ownerLower) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch {
      // If on-chain check fails, fall through — tile may not be minted yet
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

  // Always save locally (for fast serving / fallback)
  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }

  const { filePath, imageUrl } = getImagePaths(id);
  await writeFile(filePath, processedBuffer);

  // Generate WebP thumbnails for the grid canvas (SD + HD tiers)
  try {
    const THUMB_DIR = path.join(IMAGES_DIR, 'thumb');
    const THUMB_HD_DIR = path.join(IMAGES_DIR, 'thumb-hd');
    if (!existsSync(THUMB_DIR)) await mkdir(THUMB_DIR, { recursive: true });
    if (!existsSync(THUMB_HD_DIR)) await mkdir(THUMB_HD_DIR, { recursive: true });
    const [sdBuf, hdBuf] = await Promise.all([
      sharp(processedBuffer).resize(64, 64, { fit: 'cover' }).webp({ quality: 75 }).toBuffer(),
      sharp(processedBuffer).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
    ]);
    await Promise.all([
      writeFile(path.join(THUMB_DIR, `${id}.webp`), sdBuf),
      writeFile(path.join(THUMB_HD_DIR, `${id}.webp`), hdBuf),
    ]);
  } catch (err) {
    console.error(`[image] Thumb generation failed for tile ${id}:`, err.message);
  }

  // Upload to Filebase/IPFS if configured
  let ipfs = null;
  if (isFilebaseConfigured()) {
    try {
      ipfs = await uploadToFilebase(processedBuffer, `tiles/${id}.png`, 'image/png');
      console.log(`[image] Tile ${id} pinned to IPFS: ${ipfs.cid}`);
    } catch (err) {
      console.error(`[image] Filebase upload failed for tile ${id}:`, err.message);
      // Non-fatal — local image still works
    }
  }

  const finalImageUrl = ipfs?.gateway || imageUrl;
  updateTileMetadata(id, { imageUrl: finalImageUrl });

  // Persist event log entry
  const tileRecord = getTile(id);
  logEvent('tile_image_updated', id, tileRecord?.owner || null, { tileName: tileRecord?.name || `Tile #${id}`, imageUrl: finalImageUrl });

  // Broadcast so the grid renders the new image immediately
  try { broadcast({ type: 'tile_image_updated', tileId: id, imageUrl: finalImageUrl }); } catch {}

  return NextResponse.json({
    ok: true,
    imageUrl: finalImageUrl,
    ipfs: ipfs ? { cid: ipfs.cid, gateway: ipfs.gateway, s3Url: ipfs.s3Url } : null,
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
