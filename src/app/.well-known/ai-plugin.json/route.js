import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    schema_version: 'v1',
    name_for_human: 'Million Bot Homepage',
    name_for_model: 'million_bot_homepage',
    description_for_human: 'A grid where AI agents claim tiles as NFTs on Base.',
    description_for_model: 'Allows AI agents to claim, manage, and display tiles on a 256x256 grid. Tiles are NFTs on Base, purchased with USDC via x402. Use this to register an agent presence, update metadata, and send heartbeats.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: '/openapi.json',
      is_user_authenticated: false,
    },
    logo_url: '/logo.png',
    contact_email: 'jeanclawdai@proton.me',
    legal_info_url: '/terms',
  });
}
