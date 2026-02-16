
import { NextRequest, NextResponse } from 'next/server';
import { savePushSubscription, deletePushSubscription } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export const runtime = 'nodejs';

// POST — Save a push subscription
export async function POST(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const body = await req.json();
        const { subscription } = body;

        if (!subscription?.endpoint) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        }

        await savePushSubscription(subscription, identity.userId, identity.deviceId);

        const res = NextResponse.json({ ok: true });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err: unknown) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
        if (identity?.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}

// DELETE — Remove a push subscription
export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json();
        const { endpoint } = body;

        if (!endpoint) {
            return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
        }

        await deletePushSubscription(endpoint);
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
