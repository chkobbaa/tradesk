import { NextRequest, NextResponse } from 'next/server';
import { generateDeviceId, getChatDeviceCookieName, resolveUserId } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    const cookieName = getChatDeviceCookieName();
    const existing = req.cookies.get(cookieName)?.value;

    const res = NextResponse.json({ id: resolveUserId(req) });

    if (!existing) {
        res.cookies.set({
            name: cookieName,
            value: generateDeviceId(),
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 365,
        });
    }

    return res;
}
