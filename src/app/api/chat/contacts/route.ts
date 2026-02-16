import { NextRequest, NextResponse } from 'next/server';
import { deleteChatContact, getChatContacts, saveChatContact } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

const ID_PATTERN = /^[a-z0-9]{6}$/;

export async function GET(req: NextRequest) {
    const identity = await resolveChatIdentity(req);

    try {
        const contacts = await getChatContacts(identity.userId);
        const res = NextResponse.json({ contacts });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err: unknown) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 },
        );
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}

export async function POST(req: NextRequest) {
    const identity = await resolveChatIdentity(req);

    try {
        const body = await req.json() as { contactId?: string; displayName?: string };
        const contactId = (body.contactId || '').trim().toLowerCase();
        const displayName = (body.displayName || '').trim();

        if (!ID_PATTERN.test(contactId)) {
            return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });
        }

        if (contactId === identity.userId) {
            return NextResponse.json({ error: 'Cannot add your own id as a contact' }, { status: 400 });
        }

        if (displayName.length < 1 || displayName.length > 40) {
            return NextResponse.json({ error: 'Display name must be between 1 and 40 chars' }, { status: 400 });
        }

        await saveChatContact(identity.userId, contactId, displayName);
        const contacts = await getChatContacts(identity.userId);

        const res = NextResponse.json({ ok: true, contacts });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err: unknown) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 },
        );
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}

export async function DELETE(req: NextRequest) {
    const identity = await resolveChatIdentity(req);

    try {
        const body = await req.json() as { contactId?: string };
        const contactId = (body.contactId || '').trim().toLowerCase();

        if (!ID_PATTERN.test(contactId)) {
            return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });
        }

        await deleteChatContact(identity.userId, contactId);
        const contacts = await getChatContacts(identity.userId);

        const res = NextResponse.json({ ok: true, contacts });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    } catch (err: unknown) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 },
        );
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}
