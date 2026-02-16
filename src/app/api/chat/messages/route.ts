import { NextRequest, NextResponse } from 'next/server';
import { getChatMessages, saveChatMessage } from '@/db';
import { resolveUserId } from '@/lib/chatIdentity';

const ID_PATTERN = /^[a-z0-9]{6}$/;

export async function GET(req: NextRequest) {
    const me = resolveUserId(req);
    const { searchParams } = new URL(req.url);
    const withId = (searchParams.get('with') || '').trim().toLowerCase();

    if (!ID_PATTERN.test(withId)) {
        return NextResponse.json({ error: 'Invalid recipient id' }, { status: 400 });
    }

    try {
        const messages = await getChatMessages(me, withId, 200);
        return NextResponse.json({ me, withId, messages });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const me = resolveUserId(req);

    try {
        const body = await req.json() as { toId?: string; message?: string };
        const toId = (body.toId || '').trim().toLowerCase();
        const message = (body.message || '').trim();

        if (!ID_PATTERN.test(toId)) {
            return NextResponse.json({ error: 'Invalid recipient id' }, { status: 400 });
        }

        if (message.length === 0 || message.length > 500) {
            return NextResponse.json({ error: 'Message length must be between 1 and 500 chars' }, { status: 400 });
        }

        await saveChatMessage(me, toId, message);
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
