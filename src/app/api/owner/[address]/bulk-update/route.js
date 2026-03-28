import { getTilesByOwner, updateTileMetadata } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_UPDATES_PER_REQUEST = 50;
const VALID_STATUSES = ['online', 'offline', 'idle', 'busy'];
const VALID_CATEGORIES = ['trading', 'research', 'coding', 'creative', 'gaming', 'social', 'infrastructure', 'security', 'data', 'finance', 'health', 'education', 'entertainment', 'productivity', 'other', 'uncategorized'];

export async function PATCH(request, { params }) {
  try {
    const { address } = await params;
    
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // NOTE: Signature verification would go here for production.
    // For now, we verify ownership by checking the DB (tiles are immutably owned).
    // A future version should require EIP-712 signed message from the wallet.

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { updates } = body;
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'updates must be an array' }, { status: 400 });
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'updates array is empty' }, { status: 400 });
    }
    if (updates.length > MAX_UPDATES_PER_REQUEST) {
      return NextResponse.json({ 
        error: `Too many updates. Max ${MAX_UPDATES_PER_REQUEST} per request.` 
      }, { status: 400 });
    }

    // Verify all tiles are owned by this address
    const ownerTiles = getTilesByOwner(address);
    const ownerTileIds = new Set(ownerTiles.map(t => t.id));

    const results = [];
    const errors = [];

    for (const update of updates) {
      const { id, name, description, category, status, url, xHandle } = update;
      
      if (typeof id !== 'number') {
        errors.push({ id: id ?? '?', error: 'id must be a number' });
        continue;
      }
      
      if (!ownerTileIds.has(id)) {
        errors.push({ id, error: 'Tile not owned by this address' });
        continue;
      }

      // Validate fields
      const metadata = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || name.length > 64) {
          errors.push({ id, error: 'name must be a string <= 64 chars' });
          continue;
        }
        metadata.name = name.trim();
      }
      if (description !== undefined) {
        if (typeof description !== 'string' || description.length > 500) {
          errors.push({ id, error: 'description must be a string <= 500 chars' });
          continue;
        }
        metadata.description = description.trim();
      }
      if (category !== undefined) {
        if (!VALID_CATEGORIES.includes(category)) {
          errors.push({ id, error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
          continue;
        }
        metadata.category = category;
      }
      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status)) {
          errors.push({ id, error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
          continue;
        }
        metadata.status = status;
      }
      if (url !== undefined) {
        if (typeof url !== 'string' || url.length > 256) {
          errors.push({ id, error: 'url must be a string <= 256 chars' });
          continue;
        }
        metadata.url = url.trim();
      }
      if (xHandle !== undefined) {
        if (typeof xHandle !== 'string' || xHandle.length > 64) {
          errors.push({ id, error: 'xHandle must be a string <= 64 chars' });
          continue;
        }
        metadata.xHandle = xHandle.trim().replace(/^@/, ''); // strip leading @
      }

      if (Object.keys(metadata).length === 0) {
        errors.push({ id, error: 'No valid fields to update' });
        continue;
      }

      try {
        updateTileMetadata(id, metadata);
        results.push({ id, status: 'updated' });
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }

    return NextResponse.json({
      updated: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Bulk update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
