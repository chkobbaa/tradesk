
import { NextRequest, NextResponse } from 'next/server';
import { getShadowTrades, saveShadowTrade } from '@/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');

    // getShadowTrades returns all, slicing locally for now if needed, or update DB query later
    const trades = await getShadowTrades();
    if (limit) {
        return NextResponse.json(trades.slice(0, Number(limit)));
    }
    return NextResponse.json(trades);
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { trade, indicatorSnapshot } = body;
    await saveShadowTrade(
        trade,
        indicatorSnapshot ? JSON.stringify(indicatorSnapshot) : undefined
    );
    return NextResponse.json({ success: true });
}
