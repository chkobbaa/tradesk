import { NextRequest, NextResponse } from 'next/server';
import { getChatAttachmentByMessageId } from '@/db';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export const runtime = 'nodejs';

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
    if (!match) return null;

    const mimeType = (match[1] || 'application/octet-stream').toLowerCase();
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || '';

    if (isBase64) {
        const buffer = Buffer.from(payload, 'base64');
        return { mimeType, bytes: new Uint8Array(buffer) };
    }

    const decoded = decodeURIComponent(payload);
    const buffer = Buffer.from(decoded, 'utf8');
    return { mimeType, bytes: new Uint8Array(buffer) };
}

function encodeFileName(fileName: string): string {
    return encodeURIComponent(fileName).replace(/['()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;

    try {
        identity = await resolveChatIdentity(req);
        const resolvedParams = await params;
        const messageId = Number(resolvedParams.messageId);

        if (!Number.isInteger(messageId) || messageId <= 0) {
            return NextResponse.json({ error: 'Invalid messageId' }, { status: 400 });
        }

        const attachment = await getChatAttachmentByMessageId(messageId);
        if (!attachment) {
            return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
        }

        if (!attachment.fileUrl.startsWith('data:')) {
            const redirectRes = NextResponse.redirect(attachment.fileUrl, { status: 302 });
            if (identity.shouldSetCookie) {
                setChatIdentityCookie(redirectRes, identity.deviceId);
            }
            return redirectRes;
        }

        const parsed = parseDataUrl(attachment.fileUrl);
        if (!parsed) {
            return NextResponse.json({ error: 'Attachment payload is invalid' }, { status: 500 });
        }

        const response = new NextResponse(Buffer.from(parsed.bytes), {
            status: 200,
            headers: {
                'Content-Type': attachment.mimeType || parsed.mimeType,
                'Content-Length': String(parsed.bytes.byteLength),
                'Content-Disposition': `inline; filename*=UTF-8''${encodeFileName(attachment.fileName)}`,
                'Cache-Control': 'private, max-age=31536000, immutable',
                'Accept-Ranges': 'bytes',
            },
        });

        if (identity.shouldSetCookie) {
            setChatIdentityCookie(response, identity.deviceId);
        }

        return response;
    } catch (err) {
        const res = NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 },
        );

        if (identity?.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }

        return res;
    }
}
