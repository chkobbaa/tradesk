
import { NextRequest, NextResponse } from 'next/server';
import { savePushSubscription, deletePushSubscription } from '@/db';

// POST — Save a push subscription
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { subscription } = body;

        if (!subscription?.endpoint) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        }

        await savePushSubscription(subscription);
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
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
