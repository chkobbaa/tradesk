import { NextRequest, NextResponse } from 'next/server';
import { savePortfolioState, loadPortfolioState } from '@/db';

export async function GET() {
    try {
        const state = await loadPortfolioState();
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
        const { balance, positions, trades } = body;

        await savePortfolioState({
            balance: balance ?? 10000,
            positions: positions ?? [],
            trades: trades ?? [],
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'DB error' },
            { status: 500 }
        );
    }
}
