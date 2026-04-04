import { NextResponse } from 'next/server';
import { getPixelWarsSummary } from '@/lib/db';

export async function GET() {
  return NextResponse.json(getPixelWarsSummary());
}
