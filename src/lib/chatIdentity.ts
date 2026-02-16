import { createHash, randomBytes, randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createChatIdentity, getChatIdentityByDevice } from '@/db';

const DEVICE_COOKIE = 'chat_device_id';
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/;
const LEGACY_DEVICE_ID_PATTERN = /^[a-z0-9]{6}$/;
const PUBLIC_ID_PATTERN = /^[a-z0-9]{6}$/;
const MAX_GENERATION_ATTEMPTS = 20;

function hashToId(input: string): string {
    const hex = createHash('sha256').update(input).digest('hex').slice(0, 12);
    const base36 = BigInt(`0x${hex}`).toString(36);
    return base36.slice(0, 6).padStart(6, '0').toLowerCase();
}

function randomPublicId(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
        out += alphabet[randomInt(0, alphabet.length)];
    }
    return out;
}

function normalizeLegacyDeviceId(deviceId: string): string {
    return createHash('sha256').update(`legacy:${deviceId}`).digest('hex').slice(0, 32);
}

export function generateDeviceId(): string {
    return randomBytes(16).toString('hex');
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

        const first = value.split(',')[0]?.trim() || '';
        if (first) return first;
    }

    return '';
}

export function ipToUserId(ip: string): string {
    const salt = process.env.CHAT_ID_SALT || 'tradesk-chat';
    return hashToId(`${salt}:ip:${ip}`);
}

function validDeviceId(deviceId: string | undefined): deviceId is string {
    return !!deviceId && DEVICE_ID_PATTERN.test(deviceId);
}

function validLegacyDeviceId(deviceId: string | undefined): deviceId is string {
    return !!deviceId && LEGACY_DEVICE_ID_PATTERN.test(deviceId);
}

function deviceToUserId(deviceId: string): string {
    const salt = process.env.CHAT_ID_SALT || 'tradesk-chat';
    return hashToId(`${salt}:device:${deviceId}`);
}

export interface ChatIdentity {
    userId: string;
    deviceId: string;
    shouldSetCookie: boolean;
}

function resolveDeviceId(rawCookie: string | undefined): { deviceId: string; shouldSetCookie: boolean } {
    if (validDeviceId(rawCookie)) {
        return { deviceId: rawCookie, shouldSetCookie: false };
    }

    if (validLegacyDeviceId(rawCookie)) {
        return {
            deviceId: normalizeLegacyDeviceId(rawCookie),
            shouldSetCookie: true,
        };
    }

    return { deviceId: generateDeviceId(), shouldSetCookie: true };
}

export async function resolveChatIdentity(req: NextRequest): Promise<ChatIdentity> {
    const rawCookie = req.cookies.get(DEVICE_COOKIE)?.value;
    const { deviceId, shouldSetCookie } = resolveDeviceId(rawCookie);

    const existing = await getChatIdentityByDevice(deviceId);
    if (existing && PUBLIC_ID_PATTERN.test(existing.userId)) {
        return {
            userId: existing.userId,
            deviceId,
            shouldSetCookie,
        };
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
        const candidateId = randomPublicId();
        const created = await createChatIdentity(deviceId, candidateId);
        if (created && PUBLIC_ID_PATTERN.test(created.userId)) {
            return {
                userId: created.userId,
                deviceId,
                shouldSetCookie,
            };
        }
    }

    throw new Error('Unable to allocate a unique chat user ID');
}

export async function resolveUserId(req: NextRequest): Promise<string> {
    const identity = await resolveChatIdentity(req);
    return identity.userId;
}

export function setChatIdentityCookie(res: NextResponse, deviceId: string): void {
    res.cookies.set({
        name: DEVICE_COOKIE,
        value: deviceId,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
    });
}

export function getChatDeviceCookieName(): string {
    return DEVICE_COOKIE;
}
