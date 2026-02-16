
import { NextRequest, NextResponse } from 'next/server';
import { loadShadowPortfolioState, saveShadowPortfolioState } from '@/db';

const SHARED_SHADOW_USER_ID = 'system-shadow-bot';

export async function GET(req: NextRequest) {
    try {
        const state = await loadShadowPortfolioState(SHARED_SHADOW_USER_ID);
        return NextResponse.json(state);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        await saveShadowPortfolioState(SHARED_SHADOW_USER_ID, {
            balance: body.balance,
            positions: body.positions,
            trades: body.trades || []
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
