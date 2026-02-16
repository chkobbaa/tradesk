
import { NextRequest, NextResponse } from 'next/server';
import { getShadowTrades, saveShadowTrade } from '@/db';

const SHARED_SHADOW_USER_ID = 'system-shadow-bot';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');

    try {
        const trades = await getShadowTrades(SHARED_SHADOW_USER_ID);
        const payload = limit ? trades.slice(0, Number(limit)) : trades;
        return NextResponse.json(payload);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { trade, indicatorSnapshot } = body;
        await saveShadowTrade(
            SHARED_SHADOW_USER_ID,
            trade,
            indicatorSnapshot ? JSON.stringify(indicatorSnapshot) : undefined
        );

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
