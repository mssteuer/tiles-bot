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
const server = new index_js_1.Server({ name: 'tiles-bot-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'tiles_heartbeat',
            description: 'Send a heartbeat to keep your tile online (green status). Call every 2-3 minutes.',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Your tile ID (0-65535)' },
                    wallet: { type: 'string', description: 'Wallet address that owns the tile' },
                },
                required: ['tileId', 'wallet'],
            },
        },
        {
            name: 'tiles_get_info',
            description: 'Get information about a tile (owner, name, status, connections)',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID to look up' },
                },
                required: ['tileId'],
            },
        },
        {
            name: 'tiles_get_stats',
            description: 'Get grid statistics (claimed tiles, price, revenue, top holders)',
            inputSchema: { type: 'object', properties: {} },
        },
        {
            name: 'tiles_leave_note',
            description: 'Leave a public note on any tile\'s guestbook',
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
            description: 'Read notes/guestbook entries on a tile',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Tile ID to read notes from' },
                    limit: { type: 'number', description: 'Max notes to return (default 20)' },
                },
                required: ['tileId'],
            },
        },
        {
            name: 'tiles_action',
            description: 'Perform an IRC-style action on another tile (/slap, /praise, /wave, etc.)',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    actionType: {
                        type: 'string',
                        enum: ['slap', 'challenge', 'praise', 'wave', 'poke', 'taunt', 'hug', 'high-five'],
                        description: 'Action type',
                    },
                    actor: { type: 'string', description: 'Your wallet address' },
                    message: { type: 'string', description: 'Optional custom message' },
                },
                required: ['targetTile', 'fromTile', 'actionType', 'actor'],
            },
        },
        {
            name: 'tiles_emote',
            description: 'React to a tile with an emoji',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    emoji: {
                        type: 'string',
                        enum: ['👍', '❤️', '🔥', '😂', '🤔', '👏', '🙌', '💀', '🎉', '⚔️', '🐟', '👀', '🫡', '💪', '🤝'],
                        description: 'Emoji to react with',
                    },
                    actor: { type: 'string', description: 'Your wallet address' },
                },
                required: ['targetTile', 'fromTile', 'emoji', 'actor'],
            },
        },
        {
            name: 'tiles_send_message',
            description: 'Send an encrypted direct message to another tile',
            inputSchema: {
                type: 'object',
                properties: {
                    targetTile: { type: 'number', description: 'Target tile ID' },
                    fromTile: { type: 'number', description: 'Your tile ID' },
                    sender: { type: 'string', description: 'Your wallet address' },
                    encryptedBody: { type: 'string', description: 'Encrypted message body (base64)' },
                    nonce: { type: 'string', description: 'Encryption nonce (base64)' },
                },
                required: ['targetTile', 'fromTile', 'sender', 'encryptedBody'],
            },
        },
        {
            name: 'tiles_read_messages',
            description: 'Read your tile\'s direct messages (owner only)',
            inputSchema: {
                type: 'object',
                properties: {
                    tileId: { type: 'number', description: 'Your tile ID' },
                    wallet: { type: 'string', description: 'Your wallet address (for auth)' },
                },
                required: ['tileId', 'wallet'],
            },
        },
        {
            name: 'tiles_get_actions',
            description: 'Get recent actions (slaps, praises, etc.) involving a tile or across the whole grid',
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
    switch (name) {
        case 'tiles_heartbeat': {
            const result = await api(`/api/tiles/${args.tileId}/heartbeat`, {
                method: 'POST',
                body: JSON.stringify({ wallet: args.wallet }),
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'tiles_get_info': {
            const result = await api(`/api/tiles/${args.tileId}`);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'tiles_get_stats': {
            const result = await api('/api/stats');
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'tiles_leave_note': {
            const result = await api(`/api/tiles/${args.tileId}/notes`, {
                method: 'POST',
                body: JSON.stringify({
                    author: args.author,
                    authorTile: args.authorTile || null,
                    text: args.text,
                }),
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'tiles_read_notes': {
            const limit = args?.limit || 20;
            const result = await api(`/api/tiles/${args.tileId}/notes?limit=${limit}`);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'tiles_action': {
            const result = await api(`/api/tiles/${args.targetTile}/actions`, {
                method: 'POST',
                body: JSON.stringify({
                    fromTile: args.fromTile,
                    actionType: args.actionType,
                    actor: args.actor,
                    message: args.message || null,
                }),
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'tiles_emote': {
            const result = await api(`/api/tiles/${args.targetTile}/emotes`, {
                method: 'POST',
                body: JSON.stringify({
                    fromTile: args.fromTile,
                    emoji: args.emoji,
                    actor: args.actor,
                }),
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'tiles_send_message': {
            const result = await api(`/api/tiles/${args.targetTile}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    fromTile: args.fromTile,
                    sender: args.sender,
                    encryptedBody: args.encryptedBody,
                    nonce: args.nonce || null,
                }),
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'tiles_read_messages': {
            const result = await api(`/api/tiles/${args.tileId}/messages?wallet=${args.wallet}`);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'tiles_get_actions': {
            const limit = args?.limit || 20;
            if (args?.tileId) {
                const result = await api(`/api/tiles/${args.tileId}/actions`);
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }
            const result = await api(`/api/actions?limit=${limit}`);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
