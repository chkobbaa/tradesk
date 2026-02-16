import { NextRequest, NextResponse } from 'next/server';
import { resolveUserId } from '@/lib/chatIdentity';

export async function GET(req: NextRequest) {
    return NextResponse.json({ id: resolveUserId(req) });
}
