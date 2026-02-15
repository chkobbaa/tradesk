import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { password } = await req.json();

        if (!password) {
            return NextResponse.json({ error: 'Password required' }, { status: 400 });
        }

        const storedHash = process.env.TRADESK_PASSWORD_HASH;
        if (!storedHash) {
            return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
        }

        // Hash the input password with SHA-256 and compare
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (inputHash !== storedHash) {
            return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
        }

        // Set auth cookie
        const token = storedHash.slice(0, 32) + '-authed';
        const response = NextResponse.json({ ok: true });
        response.cookies.set('tradesk-auth', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return response;
    } catch {
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// Logout
export async function DELETE() {
    const response = NextResponse.json({ ok: true });
    response.cookies.set('tradesk-auth', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    return response;
}
