import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

const DEVICE_COOKIE = 'chat_device_id';
const DEVICE_ID_PATTERN = /^[a-z0-9]{6}$/;

function hashToId(input: string): string {
    const hex = createHash('sha256').update(input).digest('hex').slice(0, 12);
    const base36 = BigInt(`0x${hex}`).toString(36);
    return base36.slice(0, 6).padStart(6, '0').toLowerCase();
}

function normalizeIp(ip: string): string {
    const trimmed = ip.trim();
    if (trimmed.startsWith('::ffff:')) {
        return trimmed.slice(7);
    }
    return trimmed;
}

export function getClientIp(req: NextRequest): string {
    const candidateHeaders = [
        'x-forwarded-for',
        'x-real-ip',
        'x-vercel-forwarded-for',
        'cf-connecting-ip',
        'true-client-ip',
        'x-client-ip',
        'fly-client-ip',
    ] as const;

    for (const header of candidateHeaders) {
        const value = req.headers.get(header);
        if (!value) continue;

        const first = normalizeIp(value.split(',')[0] || '');
        if (first) return first;
    }

    return '';
}

export function ipToUserId(ip: string): string {
    const salt = process.env.CHAT_ID_SALT || 'tradesk-chat';
    return hashToId(`${salt}:ip:${ip}`);
}

export function generateDeviceId(): string {
    return hashToId(`${Date.now()}:${Math.random()}`);
}

function validDeviceId(deviceId: string | undefined): deviceId is string {
    return !!deviceId && DEVICE_ID_PATTERN.test(deviceId);
}

function deviceToUserId(deviceId: string): string {
    const salt = process.env.CHAT_ID_SALT || 'tradesk-chat';
    return hashToId(`${salt}:device:${deviceId}`);
}

export function resolveUserId(req: NextRequest): string {
    const deviceId = req.cookies.get(DEVICE_COOKIE)?.value;
    if (validDeviceId(deviceId)) {
        return deviceToUserId(deviceId);
    }

    const ip = getClientIp(req);
    if (ip) {
        return ipToUserId(ip);
    }

    const ua = req.headers.get('user-agent') || 'unknown';
    return hashToId(`fallback:${ua}`);
}

export function getChatDeviceCookieName(): string {
    return DEVICE_COOKIE;
}
