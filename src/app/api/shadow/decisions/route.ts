import { NextRequest, NextResponse } from 'next/server';
import { saveShadowDecision, getShadowDecisions } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
        const decisions = await getShadowDecisions(identity.userId, limit);
        const res = NextResponse.json(decisions);
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err) {
        const res = NextResponse.json({ error: String(err) }, { status: 500 });
        if (identity?.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}

export async function POST(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const body = await req.json();
        await saveShadowDecision(identity.userId, {
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
        const res = NextResponse.json({ ok: true });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err) {
        const res = NextResponse.json({ error: String(err) }, { status: 500 });
        if (identity?.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}
