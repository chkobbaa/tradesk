import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getChatContactDisplayName, saveChatAttachment, saveChatMessage } from '@/db';
import { sendDirectChatPushNotification } from '@/lib/notify';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export const runtime = 'nodejs';

const ID_PATTERN = /^[a-z0-9]{6}$/;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.pdf', '.txt', '.md', '.csv', '.json',
    '.zip', '.rar',
]);

const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.msi', '.ps1', '.sh', '.php', '.js', '.jar', '.com', '.scr', '.vbs', '.hta', '.dll',
]);

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-rar-compressed',
    'application/vnd.rar',
]);

function isAllowedMime(mimeType: string): boolean {
    if (ALLOWED_MIME_TYPES.has(mimeType)) return true;
    return ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix));
}

function sanitizeName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

export async function POST(req: NextRequest) {
    const identity = await resolveChatIdentity(req);

    try {
        const formData = await req.formData();
        const toId = String(formData.get('toId') || '').trim().toLowerCase();
        const file = formData.get('file');

        if (!ID_PATTERN.test(toId)) {
            return NextResponse.json({ error: 'Invalid recipient id' }, { status: 400 });
        }

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Missing file' }, { status: 400 });
        }

        if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: 'File size must be between 1 byte and 5MB' }, { status: 400 });
        }

        const originalName = sanitizeName(file.name || 'file');
        const extension = path.extname(originalName).toLowerCase();
        const mimeType = (file.type || 'application/octet-stream').toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(extension) || BLOCKED_EXTENSIONS.has(extension)) {
            return NextResponse.json({ error: 'File extension is not allowed' }, { status: 400 });
        }

        if (!isAllowedMime(mimeType)) {
            return NextResponse.json({ error: 'File type is not allowed' }, { status: 400 });
        }

        const uploadDir = path.join(process.cwd(), 'public', 'chat-uploads');
        await mkdir(uploadDir, { recursive: true });

        const storedName = `${Date.now()}-${randomUUID()}${extension}`;
        const filePath = path.join(uploadDir, storedName);

        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(arrayBuffer));

        const fileUrl = `/chat-uploads/${storedName}`;
        const messageText = `📎 ${originalName}`;

        const messageId = await saveChatMessage(identity.userId, toId, messageText);
        await saveChatAttachment(messageId, originalName, fileUrl, mimeType, file.size);

        const senderName = (await getChatContactDisplayName(toId, identity.userId)) || identity.userId;
        void sendDirectChatPushNotification({
            recipientUserId: toId,
            senderName,
            preview: `📎 ${originalName}`,
            excludeDeviceId: identity.deviceId,
        });

        const res = NextResponse.json({
            ok: true,
            attachment: {
                messageId,
                fileName: originalName,
                fileUrl,
                mimeType,
                fileSize: file.size,
            },
        });

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
