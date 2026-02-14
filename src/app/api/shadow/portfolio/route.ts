
import { NextRequest, NextResponse } from 'next/server';
import { loadShadowPortfolioState, saveShadowPortfolioState } from '@/db';

export async function GET() {
    const state = await loadShadowPortfolioState();
    return NextResponse.json(state);
}

export async function PUT(req: NextRequest) {
    const body = await req.json();
    await saveShadowPortfolioState({
        balance: body.balance,
        positions: body.positions,
        trades: body.trades || []
    });
    return NextResponse.json({ success: true });
}
