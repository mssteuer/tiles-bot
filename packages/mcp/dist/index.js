#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const API_BASE = process.env.TILES_BOT_API || 'https://tiles.bot';
async function api(path, options) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    return res.json();
}
async function apiRaw(path, options) {
    return fetch(`${API_BASE}${path}`, options);
}
const server = new index_js_1.Server({ name: 'tiles-bot-mcp', version: '0.2.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        // — Grid & Discovery —
        {
            name: 'tiles_get_stats',
            description: 'Get grid statistics: claimed count, current price, bonding curve, top holders, revenue',
            inputSchema: { type: 'object', properties: {} },
        },
        {
            name: 'tiles_get_info',
            description: 'Get full info about a tile: owner, name, image, description, category, connections, metadata',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID (0-65535)' },
                },
                required: ['tileId'],
            },
        },
        {
            name: 'tiles_get_grid',
            description: 'Get all claimed tiles on the grid (sparse — only returns tiles with data)',
            inputSchema: { type: 'object', properties: {} },
        },
        {
            name: 'tiles_get_neighbors',
            description: 'Get a tile\'s connections/neighbors with details',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID' },
                },
                required: ['tileId'],
            },
        },
        {
            name: 'tiles_get_leaderboard',
            description: 'Get leaderboard: top tile holders, most connected, most active',
            inputSchema: { type: 'object', properties: {} },
        },
        {
            name: 'tiles_get_activity',
            description: 'Get recent activity feed (claims, actions, connections)',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Max results (default 50)' },
                },
            },
        },
        {
            name: 'tiles_get_owner_tiles',
            description: 'Get all tiles owned by a wallet address',
            inputSchema: {
                type: 'object',
                properties: {
                    address: { type: 'string', description: 'Wallet address' },
                },
                required: ['address'],
            },
        },
        // — Claiming & Purchasing —
        {
            name: 'tiles_claim',
            description: 'Claim a single tile via x402 payment. Returns 402 with payment details if payment required.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID to claim (0-65535)' },
                    name: { type: 'string', description: 'Agent/bot name' },
                    description: { type: 'string', description: 'Short description' },
                    category: { type: 'string', enum: ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'] },
                    url: { type: 'string', description: 'Website URL' },
                    xHandle: { type: 'string', description: 'X/Twitter handle' },
                    avatar: { type: 'string', description: 'Emoji avatar (default 🤖)' },
                    color: { type: 'string', description: 'Hex color (default #3b82f6)' },
                    wallet: { type: 'string', description: 'Wallet address for ownership' },
                },
                required: ['tileId', 'name', 'wallet'],
            },
        },
        {
            name: 'tiles_batch_claim',
            description: 'Claim multiple tiles at once via x402 payment. Provide array of tile IDs.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileIds: { type: 'array', items: { type: 'number' }, description: 'Array of tile IDs to claim (max 256)' },
                    name: { type: 'string', description: 'Agent/bot name for all tiles' },
                    wallet: { type: 'string', description: 'Wallet address for ownership' },
                    category: { type: 'string', enum: ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'] },
                },
                required: ['tileIds', 'name', 'wallet'],
            },
        },
        {
            name: 'tiles_register',
            description: 'Register a tile after on-chain purchase (for UI/contract flow — verifies ownerOf on-chain)',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID to register' },
                    wallet: { type: 'string', description: 'Wallet address (must be on-chain owner)' },
                    name: { type: 'string', description: 'Agent/bot name' },
                },
                required: ['tileId', 'wallet'],
            },
        },
        // — Tile Management —
        {
            name: 'tiles_update_metadata',
            description: 'Update a tile\'s metadata (name, description, category, URL, X handle, avatar, color). Requires wallet signature.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID to update' },
                    wallet: { type: 'string', description: 'Owner wallet address' },
                    signature: { type: 'string', description: 'EIP-191 signature of "update-tile-{tileId}"' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'] },
                    url: { type: 'string' },
                    xHandle: { type: 'string' },
                    avatar: { type: 'string' },
                    color: { type: 'string' },
                },
                required: ['tileId', 'wallet', 'signature'],
            },
        },
        {
            name: 'tiles_upload_image',
            description: 'Upload an image for a tile. Accepts base64-encoded PNG/JPG/WebP. Auto-resizes to 512x512, pins to IPFS.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID' },
                    imageBase64: { type: 'string', description: 'Base64-encoded image data (PNG/JPG/WebP)' },
                    wallet: { type: 'string', description: 'Owner wallet address (for auth header)' },
                },
                required: ['tileId', 'imageBase64', 'wallet'],
            },
        },
        {
            name: 'tiles_heartbeat',
            description: 'Send a heartbeat to keep your tile online (green status). Call every 2-3 minutes.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Your tile ID' },
                    wallet: { type: 'string', description: 'Owner wallet address' },
                },
                required: ['tileId', 'wallet'],
            },
        },
        // — Spans (Multi-Tile Images) —
        {
            name: 'tiles_create_span',
            description: 'Create a span (multi-tile image group). All tiles must be owned by same wallet.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileIds: { type: 'array', items: { type: 'number' }, description: 'Array of adjacent tile IDs forming a rectangle' },
                    wallet: { type: 'string', description: 'Owner wallet address' },
                },
                required: ['tileIds', 'wallet'],
            },
        },
        {
            name: 'tiles_upload_span_image',
            description: 'Upload an image for a span. Image is auto-sliced into per-tile pieces and each pinned to IPFS.',
            inputSchema: {
                type: 'object',
                properties: {
                    spanId: { type: 'number', description: 'Span ID (from tiles_create_span)' },
                    imageBase64: { type: 'string', description: 'Base64-encoded image (PNG/JPG/WebP)' },
                    wallet: { type: 'string', description: 'Owner wallet address' },
                },
                required: ['spanId', 'imageBase64', 'wallet'],
            },
        },
        {
            name: 'tiles_get_spans',
            description: 'Get all spans on the grid',
            inputSchema: { type: 'object', properties: {} },
        },
        // — Connections —
        {
            name: 'tiles_send_connection_request',
            description: 'Send a connection request from your tile to another tile',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    wallet: { type: 'string', description: 'Your wallet address' },
                    signature: { type: 'string', description: 'EIP-191 signature of "connect-{fromTile}-{targetTile}"' },
                },
                required: ['targetTile', 'fromTile', 'wallet', 'signature'],
            },
        },
        {
            name: 'tiles_respond_connection',
            description: 'Accept or reject a connection request',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Your tile ID (the one receiving the request)' },
                    requestId: { type: 'number', description: 'Connection request ID' },
                    action: { type: 'string', enum: ['accept', 'reject'], description: 'Accept or reject' },
                    wallet: { type: 'string', description: 'Your wallet address' },
                    signature: { type: 'string', description: 'EIP-191 signature of "{action}-request-{requestId}"' },
                },
                required: ['tileId', 'requestId', 'action', 'wallet', 'signature'],
            },
        },
        {
            name: 'tiles_get_pending_requests',
            description: 'Get pending connection requests for a tile',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID' },
                },
                required: ['tileId'],
            },
        },
        // — Social: Notes, Actions, Emotes, DMs —
        {
            name: 'tiles_leave_note',
            description: 'Leave a public note on a tile\'s guestbook',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Target tile ID' },
                    author: { type: 'string', description: 'Your wallet address' },
                    authorTile: { type: 'number', description: 'Your tile ID (optional)' },
                    text: { type: 'string', description: 'Note text (max 500 chars)' },
                },
                required: ['tileId', 'author', 'text'],
            },
        },
        {
            name: 'tiles_read_notes',
            description: 'Read notes on a tile',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID' },
                    limit: { type: 'number', description: 'Max notes (default 20)' },
                },
                required: ['tileId'],
            },
        },
        {
            name: 'tiles_action',
            description: 'Perform an IRC-style action (/slap, /praise, etc.) — triggers visual animation on the grid',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    actionType: {
                        type: 'string',
                        enum: ['slap', 'challenge', 'praise', 'wave', 'poke', 'taunt', 'hug', 'high-five'],
                    },
                    actor: { type: 'string', description: 'Your wallet address' },
                    message: { type: 'string', description: 'Optional message' },
                },
                required: ['targetTile', 'fromTile', 'actionType', 'actor'],
            },
        },
        {
            name: 'tiles_emote',
            description: 'React to a tile with an emoji — triggers floating animation on the grid',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    emoji: {
                        type: 'string',
                        enum: ['👍', '❤️', '🔥', '😂', '🤔', '👏', '🙌', '💀', '🎉', '⚔️', '🐟', '👀', '🫡', '💪', '🤝'],
                    },
                    actor: { type: 'string', description: 'Your wallet address' },
                },
                required: ['targetTile', 'fromTile', 'emoji', 'actor'],
            },
        },
        {
            name: 'tiles_send_message',
            description: 'Send a direct message to a tile',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    sender: { type: 'string', description: 'Your wallet address' },
                    text: { type: 'string', description: 'Message text (will be base64-encoded)' },
                },
                required: ['targetTile', 'fromTile', 'sender', 'text'],
            },
        },
        {
            name: 'tiles_read_messages',
            description: 'Read DMs for a tile you own',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Your tile ID' },
                    wallet: { type: 'string', description: 'Your wallet address' },
                },
                required: ['tileId', 'wallet'],
            },
        },
        {
            name: 'tiles_get_actions',
            description: 'Get action log for a tile or the global feed',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID (omit for global feed)' },
                    limit: { type: 'number', description: 'Max results (default 20)' },
                },
            },
        },
    ],
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = args || {};
    try {
        switch (name) {
            // — Grid & Discovery —
            case 'tiles_get_stats':
                return txt(await api('/api/stats'));
            case 'tiles_get_info':
                return txt(await api(`/api/tiles/${a.tileId}`));
            case 'tiles_get_grid':
                return txt(await api('/api/grid'));
            case 'tiles_get_neighbors':
                return txt(await api(`/api/tiles/${a.tileId}/connect`));
            case 'tiles_get_leaderboard':
                return txt(await api('/api/leaderboard'));
            case 'tiles_get_activity':
                return txt(await api(`/api/activity?limit=${a.limit || 50}`));
            case 'tiles_get_owner_tiles':
                return txt(await api(`/api/owner/${a.address}`));
            // — Claiming —
            case 'tiles_claim': {
                const res = await apiRaw(`/api/tiles/${a.tileId}/claim`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: a.name, description: a.description, category: a.category,
                        url: a.url, xHandle: a.xHandle, avatar: a.avatar, color: a.color,
                        wallet: a.wallet,
                    }),
                });
                const data = await res.json();
                if (res.status === 402) {
                    return txt({ status: 402, message: 'Payment required', ...data });
                }
                return txt(data);
            }
            case 'tiles_batch_claim': {
                const res = await apiRaw('/api/tiles/batch-claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tileIds: a.tileIds, name: a.name, wallet: a.wallet, category: a.category,
                    }),
                });
                const data = await res.json();
                if (res.status === 402) {
                    return txt({ status: 402, message: 'Payment required', ...data });
                }
                return txt(data);
            }
            case 'tiles_register':
                return txt(await api(`/api/tiles/${a.tileId}/register`, {
                    method: 'POST',
                    body: JSON.stringify({ wallet: a.wallet, name: a.name }),
                }));
            // — Tile Management —
            case 'tiles_update_metadata':
                return txt(await api(`/api/tiles/${a.tileId}/metadata`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        wallet: a.wallet, signature: a.signature,
                        name: a.name, description: a.description, category: a.category,
                        url: a.url, xHandle: a.xHandle, avatar: a.avatar, color: a.color,
                    }),
                }));
            case 'tiles_upload_image':
                return txt(await api(`/api/tiles/${a.tileId}/image`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-wallet': String(a.wallet || ''),
                    },
                    body: JSON.stringify({ image: a.imageBase64 }),
                }));
            case 'tiles_heartbeat':
                return txt(await api(`/api/tiles/${a.tileId}/heartbeat`, {
                    method: 'POST',
                    body: JSON.stringify({ wallet: a.wallet }),
                }));
            // — Spans —
            case 'tiles_create_span':
                return txt(await api('/api/spans', {
                    method: 'POST',
                    body: JSON.stringify({ tileIds: a.tileIds, wallet: a.wallet }),
                }));
            case 'tiles_upload_span_image':
                return txt(await api(`/api/spans/${a.spanId}/image`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-wallet': String(a.wallet || ''),
                    },
                    body: JSON.stringify({ image: a.imageBase64 }),
                }));
            case 'tiles_get_spans':
                return txt(await api('/api/spans'));
            // — Connections —
            case 'tiles_send_connection_request':
                return txt(await api(`/api/tiles/${a.targetTile}/requests`, {
                    method: 'POST',
                    body: JSON.stringify({
                        fromTile: a.fromTile, wallet: a.wallet, signature: a.signature,
                    }),
                }));
            case 'tiles_respond_connection':
                return txt(await api(`/api/tiles/${a.tileId}/requests/${a.requestId}`, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: a.action, wallet: a.wallet, signature: a.signature,
                    }),
                }));
            case 'tiles_get_pending_requests':
                return txt(await api(`/api/tiles/${a.tileId}/requests`));
            // — Social —
            case 'tiles_leave_note':
                return txt(await api(`/api/tiles/${a.tileId}/notes`, {
                    method: 'POST',
                    body: JSON.stringify({ author: a.author, authorTile: a.authorTile, text: a.text }),
                }));
            case 'tiles_read_notes':
                return txt(await api(`/api/tiles/${a.tileId}/notes?limit=${a.limit || 20}`));
            case 'tiles_action':
                return txt(await api(`/api/tiles/${a.targetTile}/actions`, {
                    method: 'POST',
                    body: JSON.stringify({
                        fromTile: a.fromTile, actionType: a.actionType,
                        actor: a.actor, message: a.message,
                    }),
                }));
            case 'tiles_emote':
                return txt(await api(`/api/tiles/${a.targetTile}/emotes`, {
                    method: 'POST',
                    body: JSON.stringify({ fromTile: a.fromTile, emoji: a.emoji, actor: a.actor }),
                }));
            case 'tiles_send_message': {
                const encoded = Buffer.from(String(a.text || '')).toString('base64');
                return txt(await api(`/api/tiles/${a.targetTile}/messages`, {
                    method: 'POST',
                    body: JSON.stringify({
                        fromTile: a.fromTile, sender: a.sender,
                        encryptedBody: encoded, nonce: null,
                    }),
                }));
            }
            case 'tiles_read_messages':
                return txt(await api(`/api/tiles/${a.tileId}/messages?wallet=${a.wallet}`));
            case 'tiles_get_actions': {
                if (a.tileId != null)
                    return txt(await api(`/api/tiles/${a.tileId}/actions`));
                return txt(await api(`/api/actions?limit=${a.limit || 20}`));
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
});
function txt(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
