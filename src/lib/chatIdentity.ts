import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

export function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }

    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;

    return '0.0.0.0';
}

export function ipToUserId(ip: string): string {
    const salt = process.env.CHAT_ID_SALT || 'tradesk-chat';
    return createHash('sha256')
        .update(`${salt}:${ip}`)
        .digest('hex')
        .slice(0, 6)
        .toLowerCase();
}

export function resolveUserId(req: NextRequest): string {
    return ipToUserId(getClientIp(req));
}
