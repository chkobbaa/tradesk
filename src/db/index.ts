
/**
 * Database access functions — Trade History & Portfolio State
 * Refactored for Turso / LibSQL (Async)
 */
import { getClient, ensureSchema } from './schema';
import { Trade, Portfolio, Position } from '@/core/trading/types';

export { getClient } from './schema';

// Helper to ensure connection & schema before query
async function qs() {
    await ensureSchema();
    return getClient();
}

const SHARED_SHADOW_USER_ID = 'system-shadow-bot';
const LEGACY_SHADOW_USER_ID = 'system-cron-bot';

function isSharedShadowScope(userId: string): boolean {
    return userId === SHARED_SHADOW_USER_ID || userId === LEGACY_SHADOW_USER_ID;
}

// ─── Trades ────────────────────────────────────────────────────

export async function saveTrade(userId: string, trade: Trade, indicatorSnapshot?: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT OR REPLACE INTO trades
            (id, user_id, symbol, side, entry_price, exit_price, quantity,
             stop_loss, take_profit, open_time, close_time,
             entry_fee, exit_fee, pnl, indicator_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
            trade.id,
            userId,
            trade.symbol,
            trade.side,
            trade.entryPrice,
            trade.exitPrice,
            trade.quantity,
            trade.stopLoss,
            trade.takeProfit,
            trade.openTime,
            trade.closeTime,
            trade.entryFee,
            trade.exitFee,
            trade.pnl,
            indicatorSnapshot ?? null,
        ]
    });
}

export async function saveShadowTrade(userId: string, trade: Trade, indicatorSnapshot?: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT OR REPLACE INTO shadow_trades
            (id, user_id, symbol, side, entry_price, exit_price, quantity,
             stop_loss, take_profit, open_time, close_time,
             entry_fee, exit_fee, pnl, indicator_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
            trade.id,
            userId,
            trade.symbol,
            trade.side,
            trade.entryPrice,
            trade.exitPrice,
            trade.quantity,
            trade.stopLoss,
            trade.takeProfit,
            trade.openTime,
            trade.closeTime,
            trade.entryFee,
            trade.exitFee,
            trade.pnl,
            indicatorSnapshot ?? null,
        ]
    });
}

export async function getTrades(userId: string, symbol?: string): Promise<Trade[]> {
    const db = await qs();
    const sql = symbol
        ? 'SELECT * FROM trades WHERE user_id = ? AND symbol = ? ORDER BY close_time DESC'
        : 'SELECT * FROM trades WHERE user_id = ? ORDER BY close_time DESC';

    const args = symbol ? [userId, symbol] : [userId];
    const rs = await db.execute({ sql, args });

    return rs.rows.map(rowToTrade);
}

export async function getShadowTrades(userId: string, symbol?: string): Promise<Trade[]> {
    const db = await qs();
    const useSharedScope = isSharedShadowScope(userId);
    const sql = symbol
        ? useSharedScope
            ? `
                SELECT * FROM shadow_trades
                WHERE (user_id = ? OR user_id = ? OR user_id IS NULL)
                  AND symbol = ?
                ORDER BY close_time DESC
            `
            : 'SELECT * FROM shadow_trades WHERE user_id = ? AND symbol = ? ORDER BY close_time DESC'
        : useSharedScope
            ? `
                SELECT * FROM shadow_trades
                WHERE user_id = ? OR user_id = ? OR user_id IS NULL
                ORDER BY close_time DESC
            `
            : 'SELECT * FROM shadow_trades WHERE user_id = ? ORDER BY close_time DESC';

    const args = symbol
        ? useSharedScope
            ? [SHARED_SHADOW_USER_ID, LEGACY_SHADOW_USER_ID, symbol]
            : [userId, symbol]
        : useSharedScope
            ? [SHARED_SHADOW_USER_ID, LEGACY_SHADOW_USER_ID]
            : [userId];
    const rs = await db.execute({ sql, args });
    return rs.rows.map(rowToTrade);
}

export async function getTradeStats(userId: string) {
    const db = await qs();
    const rs = await db.execute({
        sql: `
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
            SUM(pnl) as total_pnl,
            AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_win,
            AVG(CASE WHEN pnl <= 0 THEN pnl END) as avg_loss,
            MAX(pnl) as best_trade,
            MIN(pnl) as worst_trade
        FROM trades
        WHERE user_id = ?
    `,
        args: [userId],
    });

    const row = rs.rows[0];
    const total = Number(row.total || 0);
    const wins = Number(row.wins || 0);

    return {
        total,
        wins,
        losses: Number(row.losses || 0),
        totalPnL: Number(row.total_pnl || 0),
        winRate: total > 0 ? (wins / total) * 100 : 0,
        avgWin: Number(row.avg_win || 0),
        avgLoss: Number(row.avg_loss || 0),
        bestTrade: Number(row.best_trade || 0),
        worstTrade: Number(row.worst_trade || 0),
    };
}

/** Compute equity curve: cumulative balance after each trade */
export async function getEquityCurve(userId: string, startingBalance: number = 10000) {
    const db = await qs();
    const rs = await db.execute({
        sql: 'SELECT close_time, pnl FROM trades WHERE user_id = ? ORDER BY close_time ASC',
        args: [userId],
    });

    let balance = startingBalance;
    const points: { time: number; balance: number }[] = [];

    for (const row of rs.rows) {
        balance += Number(row.pnl);
        points.push({ time: Number(row.close_time), balance });
    }
    return points;
}

/** Compute max drawdown from equity curve */
export async function getDrawdownData(userId: string, startingBalance: number = 10000) {
    const curve = await getEquityCurve(userId, startingBalance);
    let peak = startingBalance;
    let maxDrawdown = 0;

    return curve.map(point => {
        if (point.balance > peak) peak = point.balance;
        const dd = ((peak - point.balance) / peak) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        return { time: point.time, drawdown: dd, maxDrawdown };
    });
}

/** Per-symbol breakdown */
export async function getSymbolStats(userId: string) {
    const db = await qs();
    const rs = await db.execute({
        sql: `
        SELECT
            symbol,
            COUNT(*) as trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
            SUM(pnl) as total_pnl,
            AVG(pnl) as avg_pnl
        FROM trades
        WHERE user_id = ?
        GROUP BY symbol
        ORDER BY total_pnl DESC
    `,
        args: [userId],
    });

    return rs.rows.map(row => ({
        symbol: row.symbol as string,
        trades: Number(row.trades),
        wins: Number(row.wins),
        total_pnl: Number(row.total_pnl),
        avg_pnl: Number(row.avg_pnl),
    }));
}

// ─── Portfolio State ───────────────────────────────────────────

export async function savePortfolioState(userId: string, portfolio: Portfolio): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT INTO portfolio_state_user (user_id, balance, positions_json, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id)
            DO UPDATE SET
                balance = excluded.balance,
                positions_json = excluded.positions_json,
                updated_at = datetime('now')
        `,
        args: [
            userId,
            portfolio.balance,
            JSON.stringify(portfolio.positions),
        ]
    });
}

export async function saveShadowPortfolioState(userId: string, portfolio: Portfolio): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT INTO shadow_portfolio_state_user (user_id, balance, positions_json, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id)
            DO UPDATE SET
                balance = excluded.balance,
                positions_json = excluded.positions_json,
                updated_at = datetime('now')
        `,
        args: [
            userId,
            portfolio.balance,
            JSON.stringify(portfolio.positions),
        ]
    });
}

export async function loadPortfolioState(userId: string): Promise<{ balance: number; positions: Position[] }> {
    const db = await qs();
    const rs = await db.execute({
        sql: 'SELECT balance, positions_json FROM portfolio_state_user WHERE user_id = ? LIMIT 1',
        args: [userId],
    });
    const row = rs.rows[0];

    if (!row) return { balance: 10000, positions: [] };
    return {
        balance: Number(row.balance),
        positions: JSON.parse((row.positions_json as string) || '[]'),
    };
}

export async function loadShadowPortfolioState(userId: string): Promise<{ balance: number; positions: Position[] }> {
    const db = await qs();
    const useSharedScope = isSharedShadowScope(userId);

    const rs = await db.execute(
        useSharedScope
            ? {
                sql: `
                    SELECT balance, positions_json
                    FROM shadow_portfolio_state_user
                    WHERE user_id = ? OR user_id = ?
                    ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, updated_at DESC
                    LIMIT 1
                `,
                args: [SHARED_SHADOW_USER_ID, LEGACY_SHADOW_USER_ID, SHARED_SHADOW_USER_ID],
            }
            : {
                sql: 'SELECT balance, positions_json FROM shadow_portfolio_state_user WHERE user_id = ? LIMIT 1',
                args: [userId],
            }
    );
    let row = rs.rows[0];

    if (!row && useSharedScope) {
        const legacyRs = await db.execute({
            sql: 'SELECT balance, positions_json FROM shadow_portfolio_state WHERE id = 1 LIMIT 1',
        });
        row = legacyRs.rows[0];
    }

    if (!row) return { balance: 10000, positions: [] };
    return {
        balance: Number(row.balance),
        positions: JSON.parse((row.positions_json as string) || '[]'),
    };
}

// ─── Daily PnL ─────────────────────────────────────────────────

export async function getDailyPnL(userId: string, table: 'trades' | 'shadow_trades' = 'trades') {
    const db = await qs();
    const rs = await db.execute({
        sql: `
        SELECT
            date(close_time / 1000, 'unixepoch') as day,
            SUM(pnl) as daily_pnl,
            COUNT(*) as trade_count,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
        FROM ${table}
        WHERE user_id = ?
        GROUP BY day
        ORDER BY day ASC
    `,
        args: [userId],
    });

    return rs.rows.map(row => ({
        day: row.day as string,
        pnl: Number(row.daily_pnl || 0),
        trades: Number(row.trade_count || 0),
        wins: Number(row.wins || 0),
    }));
}

// ─── PnL Distribution ─────────────────────────────────────────

export async function getPnLDistribution(userId: string, table: 'trades' | 'shadow_trades' = 'trades') {
    const db = await qs();
    const rs = await db.execute({
        sql: `SELECT pnl FROM ${table} WHERE user_id = ? ORDER BY pnl ASC`,
        args: [userId],
    });

    const values = rs.rows.map(r => Number(r.pnl));
    if (values.length === 0) return [];

    const min = Math.floor(values[0]);
    const max = Math.ceil(values[values.length - 1]);
    const range = max - min;
    const bucketCount = Math.min(20, Math.max(5, Math.ceil(values.length / 3)));
    const bucketSize = range / bucketCount || 1;

    const buckets: { rangeStart: number; rangeEnd: number; count: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
        buckets.push({
            rangeStart: min + i * bucketSize,
            rangeEnd: min + (i + 1) * bucketSize,
            count: 0,
        });
    }

    for (const v of values) {
        const idx = Math.min(bucketCount - 1, Math.floor((v - min) / bucketSize));
        buckets[idx].count++;
    }

    return buckets;
}

// ─── Shadow Trade Stats ───────────────────────────────────────

export async function getShadowTradeStats(userId: string) {
    const db = await qs();
    const useSharedScope = isSharedShadowScope(userId);
    const rs = await db.execute(
        useSharedScope
            ? {
                sql: `
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
            SUM(pnl) as total_pnl,
            AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_win,
            AVG(CASE WHEN pnl <= 0 THEN pnl END) as avg_loss,
            MAX(pnl) as best_trade,
            MIN(pnl) as worst_trade
        FROM shadow_trades
        WHERE user_id = ? OR user_id = ? OR user_id IS NULL
    `,
                args: [SHARED_SHADOW_USER_ID, LEGACY_SHADOW_USER_ID],
            }
            : {
                sql: `
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
            SUM(pnl) as total_pnl,
            AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_win,
            AVG(CASE WHEN pnl <= 0 THEN pnl END) as avg_loss,
            MAX(pnl) as best_trade,
            MIN(pnl) as worst_trade
        FROM shadow_trades
        WHERE user_id = ?
    `,
                args: [userId],
            }
    );

    const row = rs.rows[0];
    const total = Number(row.total || 0);
    const wins = Number(row.wins || 0);

    return {
        total,
        wins,
        losses: Number(row.losses || 0),
        totalPnL: Number(row.total_pnl || 0),
        winRate: total > 0 ? (wins / total) * 100 : 0,
        avgWin: Number(row.avg_win || 0),
        avgLoss: Number(row.avg_loss || 0),
        bestTrade: Number(row.best_trade || 0),
        worstTrade: Number(row.worst_trade || 0),
    };
}

// ─── Shadow Equity Curve ──────────────────────────────────────

export async function getShadowEquityCurve(userId: string, startingBalance: number = 10000) {
    const db = await qs();
    const useSharedScope = isSharedShadowScope(userId);
    const rs = await db.execute(
        useSharedScope
            ? {
                sql: `
                    SELECT close_time, pnl FROM shadow_trades
                    WHERE user_id = ? OR user_id = ? OR user_id IS NULL
                    ORDER BY close_time ASC
                `,
                args: [SHARED_SHADOW_USER_ID, LEGACY_SHADOW_USER_ID],
            }
            : {
                sql: 'SELECT close_time, pnl FROM shadow_trades WHERE user_id = ? ORDER BY close_time ASC',
                args: [userId],
            }
    );

    let balance = startingBalance;
    const points: { time: number; balance: number }[] = [];

    for (const row of rs.rows) {
        balance += Number(row.pnl);
        points.push({ time: Number(row.close_time), balance });
    }
    return points;
}

// ─── Shadow Decision Log ──────────────────────────────────────

export interface ShadowDecisionLog {
    id?: number;
    timestamp: number;
    symbol: string;
    action: string;
    score: number;
    reason: string;
    hadPosition: boolean;
    positionSide?: string;
    positionPnlPct?: number;
    executed: boolean;
    result?: string;
}

export async function saveShadowDecision(userId: string, d: ShadowDecisionLog): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `INSERT INTO shadow_decisions (user_id, timestamp, symbol, action, score, reason, had_position, position_side, position_pnl_pct, executed, result)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            userId,
            d.timestamp, d.symbol, d.action, d.score, d.reason,
            d.hadPosition ? 1 : 0, d.positionSide || null, d.positionPnlPct ?? null,
            d.executed ? 1 : 0, d.result || null,
        ],
    });
}

export async function getShadowDecisions(userId: string, limit: number = 50): Promise<ShadowDecisionLog[]> {
    const db = await qs();
    const useSharedScope = isSharedShadowScope(userId);
    const rs = await db.execute(
        useSharedScope
            ? {
                sql: `
                    SELECT * FROM shadow_decisions
                    WHERE user_id = ? OR user_id = ? OR user_id IS NULL
                    ORDER BY timestamp DESC
                    LIMIT ?
                `,
                args: [SHARED_SHADOW_USER_ID, LEGACY_SHADOW_USER_ID, limit],
            }
            : {
                sql: `SELECT * FROM shadow_decisions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?`,
                args: [userId, limit],
            }
    );

    return rs.rows.map(row => ({
        id: Number(row.id),
        timestamp: Number(row.timestamp),
        symbol: row.symbol as string,
        action: row.action as string,
        score: Number(row.score),
        reason: row.reason as string,
        hadPosition: row.had_position === 1,
        positionSide: row.position_side as string | undefined,
        positionPnlPct: row.position_pnl_pct != null ? Number(row.position_pnl_pct) : undefined,
        executed: row.executed === 1,
        result: row.result as string | undefined,
    }));
}

// ─── Push Subscriptions ───────────────────────────────────────

export interface PushSubscriptionRecord {
    endpoint: string;
    subscription: unknown; // PushSubscription JSON
    userId?: string;
    deviceId?: string;
}

export async function savePushSubscription(
    subscription: { endpoint: string; [key: string]: unknown },
    userId?: string,
    deviceId?: string,
): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT INTO push_subscriptions (endpoint, subscription_json, user_id, device_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(endpoint)
            DO UPDATE SET
                subscription_json = excluded.subscription_json,
                user_id = excluded.user_id,
                device_id = excluded.device_id
        `,
        args: [subscription.endpoint, JSON.stringify(subscription), userId ?? null, deviceId ?? null],
    });
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const db = await qs();
    const rs = await db.execute('SELECT endpoint, subscription_json, user_id, device_id FROM push_subscriptions');
    return rs.rows.map(row => ({
        endpoint: row.endpoint as string,
        subscription: JSON.parse(row.subscription_json as string),
        userId: row.user_id as string | undefined,
        deviceId: row.device_id as string | undefined,
    }));
}

export async function getPushSubscriptionsByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    const db = await qs();
    const rs = await db.execute({
        sql: `SELECT endpoint, subscription_json, user_id, device_id FROM push_subscriptions WHERE user_id = ?`,
        args: [userId],
    });

    return rs.rows.map(row => ({
        endpoint: row.endpoint as string,
        subscription: JSON.parse(row.subscription_json as string),
        userId: row.user_id as string | undefined,
        deviceId: row.device_id as string | undefined,
    }));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
        args: [endpoint],
    });
}

// ─── Chat Identities ──────────────────────────────────────────

export interface ChatIdentityRecord {
    deviceId: string;
    userId: string;
}

export async function getChatIdentityByDevice(deviceId: string): Promise<ChatIdentityRecord | null> {
    const db = await qs();
    const rs = await db.execute({
        sql: `SELECT device_id, user_id FROM chat_identities WHERE device_id = ? LIMIT 1`,
        args: [deviceId],
    });

    const row = rs.rows[0];
    if (!row) return null;

    return {
        deviceId: row.device_id as string,
        userId: row.user_id as string,
    };
}

export async function createChatIdentity(deviceId: string, userId: string): Promise<ChatIdentityRecord | null> {
    const db = await qs();
    await db.execute({
        sql: `INSERT OR IGNORE INTO chat_identities (device_id, user_id) VALUES (?, ?)`,
        args: [deviceId, userId],
    });

    return getChatIdentityByDevice(deviceId);
}

// ─── Chat Messages ────────────────────────────────────────────

export interface ChatMessageRecord {
    id: number;
    fromId: string;
    toId: string;
    message: string;
    timestamp: number;
    attachment?: ChatAttachmentRecord;
}

export interface ChatAttachmentRecord {
    messageId: number;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
}

export interface ChatContactRecord {
    id: number;
    ownerId: string;
    contactId: string;
    displayName: string;
}

export async function saveChatMessage(fromId: string, toId: string, message: string): Promise<number> {
    const db = await qs();
    const rs = await db.execute({
        sql: `INSERT INTO chat_messages (from_id, to_id, message, timestamp) VALUES (?, ?, ?, ?)`,
        args: [fromId, toId, message, Date.now()],
    });

    return Number(rs.lastInsertRowid || 0);
}

export async function saveChatAttachment(
    messageId: number,
    fileName: string,
    fileUrl: string,
    mimeType: string,
    fileSize: number,
): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT INTO chat_attachments (message_id, file_name, file_url, mime_type, file_size)
            VALUES (?, ?, ?, ?, ?)
        `,
        args: [messageId, fileName, fileUrl, mimeType, fileSize],
    });
}

export async function getChatAttachmentByMessageId(messageId: number): Promise<ChatAttachmentRecord | null> {
    const db = await qs();
    const rs = await db.execute({
        sql: `
            SELECT message_id, file_name, file_url, mime_type, file_size
            FROM chat_attachments
            WHERE message_id = ?
            LIMIT 1
        `,
        args: [messageId],
    });

    const row = rs.rows[0];
    if (!row) return null;

    return {
        messageId: Number(row.message_id),
        fileName: row.file_name as string,
        fileUrl: row.file_url as string,
        mimeType: row.mime_type as string,
        fileSize: Number(row.file_size),
    };
}

export async function saveChatContact(ownerId: string, contactId: string, displayName: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT INTO chat_contacts (owner_id, contact_id, display_name)
            VALUES (?, ?, ?)
            ON CONFLICT(owner_id, contact_id)
            DO UPDATE SET display_name = excluded.display_name
        `,
        args: [ownerId, contactId, displayName],
    });
}

export async function getChatContacts(ownerId: string): Promise<ChatContactRecord[]> {
    const db = await qs();
    const rs = await db.execute({
        sql: `
            SELECT id, owner_id, contact_id, display_name
            FROM chat_contacts
            WHERE owner_id = ?
            ORDER BY lower(display_name) ASC
        `,
        args: [ownerId],
    });

    return rs.rows.map(row => ({
        id: Number(row.id),
        ownerId: row.owner_id as string,
        contactId: row.contact_id as string,
        displayName: row.display_name as string,
    }));
}

export async function deleteChatContact(ownerId: string, contactId: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `DELETE FROM chat_contacts WHERE owner_id = ? AND contact_id = ?`,
        args: [ownerId, contactId],
    });
}

export async function getChatContactDisplayName(ownerId: string, contactId: string): Promise<string | null> {
    const db = await qs();
    const rs = await db.execute({
        sql: `
            SELECT display_name
            FROM chat_contacts
            WHERE owner_id = ? AND contact_id = ?
            LIMIT 1
        `,
        args: [ownerId, contactId],
    });

    const row = rs.rows[0];
    if (!row) return null;
    return row.display_name as string;
}

export async function getChatMessages(userA: string, userB: string, limit: number = 100): Promise<ChatMessageRecord[]> {
    const db = await qs();
    const rs = await db.execute({
        sql: `
            SELECT id, from_id, to_id, message, timestamp
            FROM chat_messages
            WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
            ORDER BY timestamp ASC
            LIMIT ?
        `,
        args: [userA, userB, userB, userA, limit],
    });

    const messages = rs.rows.map(row => ({
        id: Number(row.id),
        fromId: row.from_id as string,
        toId: row.to_id as string,
        message: row.message as string,
        timestamp: Number(row.timestamp),
    }));

    if (messages.length === 0) {
        return messages;
    }

    const messageIds = messages.map(m => m.id);
    const placeholders = messageIds.map(() => '?').join(', ');
    const attachmentsRs = await db.execute({
        sql: `
            SELECT message_id, file_name, file_url, mime_type, file_size
            FROM chat_attachments
            WHERE message_id IN (${placeholders})
        `,
        args: messageIds,
    });

    const attachmentByMessageId = new Map<number, ChatAttachmentRecord>();
    for (const row of attachmentsRs.rows) {
        const messageId = Number(row.message_id);
        attachmentByMessageId.set(messageId, {
            messageId,
            fileName: row.file_name as string,
            fileUrl: `/api/chat/attachments/${messageId}`,
            mimeType: row.mime_type as string,
            fileSize: Number(row.file_size),
        });
    }

    return messages.map(message => ({
        ...message,
        attachment: attachmentByMessageId.get(message.id),
    }));
}

export async function getIncomingChatMessages(userId: string, sinceId: number, limit: number = 100): Promise<ChatMessageRecord[]> {
    const db = await qs();
    const rs = await db.execute({
        sql: `
            SELECT id, from_id, to_id, message, timestamp
            FROM chat_messages
            WHERE to_id = ? AND id > ?
            ORDER BY id ASC
            LIMIT ?
        `,
        args: [userId, sinceId, limit],
    });

    return rs.rows.map(row => ({
        id: Number(row.id),
        fromId: row.from_id as string,
        toId: row.to_id as string,
        message: row.message as string,
        timestamp: Number(row.timestamp),
    }));
}

// ─── Helpers ───────────────────────────────────────────────────

function rowToTrade(row: Record<string, unknown>): Trade {
    return {
        id: row.id as string,
        symbol: row.symbol as string,
        side: row.side as 'LONG' | 'SHORT',
        entryPrice: Number(row.entry_price),
        exitPrice: Number(row.exit_price),
        quantity: Number(row.quantity),
        stopLoss: row.stop_loss ? Number(row.stop_loss) : null,
        takeProfit: row.take_profit ? Number(row.take_profit) : null,
        openTime: Number(row.open_time),
        closeTime: Number(row.close_time),
        entryFee: Number(row.entry_fee),
        exitFee: Number(row.exit_fee),
        pnl: Number(row.pnl),
    };
}
