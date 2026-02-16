import { NextRequest, NextResponse } from 'next/server';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    try {
        const identity = await resolveChatIdentity(req);
        const res = NextResponse.json({ id: identity.userId });

        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }

        return res;
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
