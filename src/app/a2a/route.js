import { NextResponse } from 'next/server';
import { getTile, getClaimedTiles, getClaimedCount, getCurrentPrice, TOTAL_TILES } from '@/lib/db';

/**
 * POST /a2a
 *
 * Google A2A (Agent-to-Agent) protocol endpoint.
 * Accepts JSON-RPC 2.0 requests and executes tasks.
 *
 * Spec: https://google.github.io/A2A/
 * Decision #141: prioritize agent-consumable interfaces.
 */

const SUPPORTED_SKILLS = {
  'get-tile': {
    id: 'get-tile',
    name: 'Get Tile Info',
    description: 'Get full info about a tile: owner, name, description, category, metadata, online status.',
    inputModes: ['application/json'],
    outputModes: ['application/json'],
    examples: [
      { input: '{"tileId": 42}', output: '{"tile": {"id": 42, "name": "...", "owner": "0x..."}}' },
    ],
  },
  'search-tiles': {
    id: 'search-tiles',
    name: 'Search Tiles',
    description: 'Search tiles by name, category, owner, or status. Returns matching tiles from the grid.',
    inputModes: ['application/json'],
    outputModes: ['application/json'],
    examples: [
      { input: '{"q": "trading", "category": "trading", "limit": 10}', output: '{"tiles": [...], "total": 42}' },
    ],
  },
  'get-grid-stats': {
    id: 'get-grid-stats',
    name: 'Get Grid Statistics',
    description: 'Get overall grid stats: total tiles, claimed count, current price, bonding curve progress.',
    inputModes: ['application/json'],
    outputModes: ['application/json'],
    examples: [
      { input: '{}', output: '{"claimed": 150, "total": 65536, "current_price_usdc": 1.02}' },
    ],
  },
  'list-tiles': {
    id: 'list-tiles',
    name: 'List Claimed Tiles',
    description: 'List all claimed tiles on the grid, optionally filtered by category.',
    inputModes: ['application/json'],
    outputModes: ['application/json'],
    examples: [
      { input: '{"category": "coding", "limit": 20}', output: '{"tiles": [...]}' },
    ],
  },
};

function makeTask(id, state, artifacts = [], message = null) {
  return {
    id,
    sessionId: id,
    status: {
      state,
      ...(message ? { message: { role: 'agent', parts: [{ type: 'text', text: message }] } } : {}),
      timestamp: new Date().toISOString(),
    },
    artifacts,
    metadata: {},
  };
}

async function executeTask(skill, input) {
  switch (skill) {
    case 'get-tile': {
      const tileId = input?.tileId ?? input?.tile_id;
      if (tileId === undefined || tileId === null) {
        throw { code: -32602, message: 'tileId is required' };
      }
      const tile = getTile(Number(tileId));
      if (!tile) {
        return { tile: null, found: false };
      }
      return { tile, found: true };
    }

    case 'search-tiles': {
      const allTiles = getClaimedTiles({ category: input?.category || null });
      const q = (input?.q || '').toLowerCase().trim();
      const limit = Math.min(Number(input?.limit) || 50, 200);
      const offset = Number(input?.offset) || 0;
      const owner = (input?.owner || '').toLowerCase();

      let filtered = allTiles;
      if (q) {
        filtered = filtered.filter(
          (t) =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.x_handle || '').toLowerCase().includes(q)
        );
      }
      if (owner) {
        filtered = filtered.filter((t) => (t.owner || '').toLowerCase() === owner);
      }
      if (input?.status) {
        filtered = filtered.filter((t) => t.status === input.status);
      }

      const total = filtered.length;
      const page = filtered.slice(offset, offset + limit);
      return { tiles: page, total, limit, offset, hasMore: offset + limit < total };
    }

    case 'get-grid-stats': {
      const claimed = getClaimedCount();
      const price = getCurrentPrice();
      return {
        claimed,
        total: TOTAL_TILES,
        unclaimed: TOTAL_TILES - claimed,
        current_price_usdc: parseFloat(price.toFixed(4)),
        fill_percentage: parseFloat(((claimed / TOTAL_TILES) * 100).toFixed(2)),
      };
    }

    case 'list-tiles': {
      const category = input?.category || null;
      const limit = Math.min(Number(input?.limit) || 100, 500);
      const offset = Number(input?.offset) || 0;
      const tiles = getClaimedTiles({ category });
      const total = tiles.length;
      const page = tiles.slice(offset, offset + limit);
      return { tiles: page, total, limit, offset, hasMore: offset + limit < total };
    }

    default:
      throw { code: -32601, message: `Skill '${skill}' not found` };
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 }
    );
  }

  const { jsonrpc, id, method, params } = body;

  // Validate JSON-RPC 2.0
  if (jsonrpc !== '2.0') {
    return NextResponse.json(
      { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' } },
      { status: 400 }
    );
  }

  // A2A methods
  if (method === 'tasks/send') {
    const taskId = params?.id || `task-${Date.now()}`;
    const skill = params?.skill || params?.message?.skill;
    const inputPart = params?.message?.parts?.[0];
    let input = {};

    if (inputPart?.type === 'text') {
      try {
        input = JSON.parse(inputPart.text);
      } catch {
        input = { query: inputPart.text };
      }
    } else if (inputPart?.type === 'data') {
      input = inputPart.data || {};
    } else if (params?.input) {
      input = params.input;
    }

    try {
      const result = await executeTask(skill, input);
      const artifact = {
        name: 'result',
        mimeType: 'application/json',
        parts: [{ type: 'data', data: result }],
      };
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: makeTask(taskId, 'completed', [artifact]),
      });
    } catch (err) {
      if (err?.code) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: err,
        });
      }
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: makeTask(taskId, 'failed', [], String(err?.message || err)),
      });
    }
  }

  if (method === 'tasks/get') {
    // We don't persist tasks — return not found
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32001, message: 'Task not found — tiles.bot does not persist tasks' },
    });
  }

  if (method === 'tasks/cancel') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32001, message: 'Cancel not supported — tasks are synchronous' },
    });
  }

  return NextResponse.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `Method '${method}' not found` } },
    { status: 404 }
  );
}

// Allow GET to list supported skills (discovery)
export async function GET() {
  return NextResponse.json(
    {
      protocol: 'A2A',
      version: '0.2.1',
      endpoint: 'https://tiles.bot/a2a',
      agent_card: 'https://tiles.bot/.well-known/agent.json',
      skills: Object.values(SUPPORTED_SKILLS),
      note: 'Read-only skills only. Write operations (tile claim, metadata update) require wallet auth — use the REST API or MCP server.',
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
