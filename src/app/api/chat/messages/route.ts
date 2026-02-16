import { NextRequest, NextResponse } from 'next/server';
import { getChatMessages, saveChatMessage } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';
import { sendPushNotification } from '@/lib/notify';

const ID_PATTERN = /^[a-z0-9]{6}$/;
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const me = identity.userId;
        const { searchParams } = new URL(req.url);
        const withId = (searchParams.get('with') || '').trim().toLowerCase();

        if (!ID_PATTERN.test(withId)) {
            return NextResponse.json({ error: 'Invalid recipient id' }, { status: 400 });
        }

        const messages = await getChatMessages(me, withId, 200);
        const res = NextResponse.json({ me, withId, messages });
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

export async function POST(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const me = identity.userId;
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
        void sendPushNotification('New chat message', `${me}: ${message.slice(0, 80)}`, `chat-text-${toId}`, '/mobile');
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
