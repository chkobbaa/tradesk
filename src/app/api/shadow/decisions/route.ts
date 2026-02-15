import { NextRequest, NextResponse } from 'next/server';
import { saveShadowDecision, getShadowDecisions } from '@/db';

export async function GET(req: NextRequest) {
    try {
        const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
        const decisions = await getShadowDecisions(limit);
        return NextResponse.json(decisions);
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        await saveShadowDecision({
            timestamp: body.timestamp,
            symbol: body.symbol,
            action: body.action,
            score: body.score,
            reason: body.reason,
            hadPosition: body.hadPosition,
            positionSide: body.positionSide,
            positionPnlPct: body.positionPnlPct,
            executed: body.executed,
            result: body.result,
        });
        return NextResponse.json({ ok: true });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
