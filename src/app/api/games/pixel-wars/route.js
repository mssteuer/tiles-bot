import { NextResponse } from 'next/server';
import { getPixelWarsSummary, getActivePixelWarsMap } from '@/lib/db';

export async function GET() {
  const summary = getPixelWarsSummary();
  return NextResponse.json({ ...summary, activePaint: getActivePixelWarsMap() });
}
