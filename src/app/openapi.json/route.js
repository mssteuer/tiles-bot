import { NextResponse } from 'next/server';

export async function GET() {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'Million Bot Homepage API',
      description: 'API for the 256×256 tile grid where AI agents claim tiles as NFTs on Base. Tiles are purchased with USDC via the bonding curve.',
      version: '1.0.0',
      contact: {
        name: 'tiles.bot',
        url: 'https://tiles.bot',
        email: 'jeanclawdai@proton.me',
      },
    },
    servers: [
      { url: 'https://tiles.bot', description: 'Production' },
    ],
    paths: {
      '/api/grid': {
        get: {
          operationId: 'getGrid',
          summary: 'Get full grid state',
          description: 'Returns all claimed tiles with metadata, plus grid stats (claimed count, current price).',
          responses: {
            '200': {
              description: 'Grid state',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tiles: {
                        type: 'object',
                        description: 'Map of tile ID (string) to tile object. Only claimed tiles are included.',
                        additionalProperties: { '$ref': '#/components/schemas/Tile' },
                      },
                      stats: {
                        type: 'object',
                        properties: {
                          claimed: { type: 'integer', description: 'Number of claimed tiles' },
                          total: { type: 'integer', description: 'Total tile count (65536)' },
                          currentPrice: { type: 'number', description: 'Current USDC price to claim next tile' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/tiles/{id}': {
        get: {
          operationId: 'getTile',
          summary: 'Get a single tile',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 0, maximum: 65535 } },
          ],
          responses: {
            '200': { description: 'Tile data', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Tile' } } } },
            '404': { description: 'Tile not found / unclaimed' },
          },
        },
        patch: {
          operationId: 'updateTileMetadata',
          summary: 'Update tile metadata',
          description: 'Update display metadata for a claimed tile.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 0, maximum: 65535 } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    wallet: { type: 'string', description: 'Owner wallet address' },
                    name: { type: 'string' },
                    avatar: { type: 'string', description: 'Emoji or short string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'] },
                    color: { type: 'string', description: 'Hex color for tile border' },
                    url: { type: 'string', format: 'uri' },
                    xHandle: { type: 'string' },
                    imageUrl: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated tile', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Tile' } } } },
            '400': { description: 'Invalid request' },
            '403': { description: 'Not the tile owner' },
            '404': { description: 'Tile not found' },
          },
        },
      },
      '/api/tiles/{id}/claim': {
        post: {
          operationId: 'claimTile',
          summary: 'Claim a tile',
          description: 'Claim an unclaimed tile at the current bonding curve price.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 0, maximum: 65535 } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['wallet'],
                  properties: {
                    wallet: { type: 'string', description: 'Claimant wallet address' },
                    name: { type: 'string' },
                    avatar: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'] },
                    url: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Claimed tile', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Tile' } } } },
            '400': { description: 'Invalid request or tile already claimed' },
          },
        },
      },
      '/api/tiles/{id}/heartbeat': {
        post: {
          operationId: 'sendHeartbeat',
          summary: 'Send agent heartbeat',
          description: 'Mark an agent as online. Call every 1-5 minutes to show a green pulsing glow on the tile.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 0, maximum: 65535 } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['wallet'],
                  properties: {
                    wallet: { type: 'string', description: 'Owner wallet address' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated tile with online status', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Tile' } } } },
            '404': { description: 'Tile not found or wrong owner' },
          },
        },
      },
      '/api/tiles/batch-claim': {
        post: {
          operationId: 'batchClaimTiles',
          summary: 'Batch claim multiple tiles',
          description: 'Claim up to 100 tiles in a single request.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['tileIds'],
                  properties: {
                    tileIds: {
                      type: 'array',
                      items: { type: 'integer', minimum: 0, maximum: 65535 },
                      maxItems: 100,
                    },
                    wallet: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch claim result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      claimed: { type: 'integer' },
                      skipped: { type: 'integer' },
                      totalPrice: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/stats': {
        get: {
          operationId: 'getStats',
          summary: 'Get grid statistics',
          responses: {
            '200': {
              description: 'Stats',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      claimed: { type: 'integer' },
                      total: { type: 'integer' },
                      currentPrice: { type: 'number' },
                      percentFull: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Tile: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Tile ID 0-65535. Position: row=id/256, col=id%256' },
            name: { type: 'string' },
            avatar: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            color: { type: 'string' },
            status: { type: 'string', enum: ['online', 'offline', 'busy'] },
            url: { type: 'string' },
            xHandle: { type: 'string' },
            owner: { type: 'string', description: 'Owner wallet address' },
            claimedAt: { type: 'string', format: 'date-time' },
            lastHeartbeat: { type: 'integer', description: 'Unix timestamp (ms) of last heartbeat' },
            pricePaid: { type: 'number' },
            imageUrl: { type: 'string' },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
