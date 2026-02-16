
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

// ─── Trades ────────────────────────────────────────────────────

export async function saveTrade(trade: Trade, indicatorSnapshot?: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT OR REPLACE INTO trades
            (id, symbol, side, entry_price, exit_price, quantity,
             stop_loss, take_profit, open_time, close_time,
             entry_fee, exit_fee, pnl, indicator_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
            trade.id,
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

export async function saveShadowTrade(trade: Trade, indicatorSnapshot?: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            INSERT OR REPLACE INTO shadow_trades
            (id, symbol, side, entry_price, exit_price, quantity,
             stop_loss, take_profit, open_time, close_time,
             entry_fee, exit_fee, pnl, indicator_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
            trade.id,
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

export async function getTrades(symbol?: string): Promise<Trade[]> {
    const db = await qs();
    const sql = symbol
        ? 'SELECT * FROM trades WHERE symbol = ? ORDER BY close_time DESC'
        : 'SELECT * FROM trades ORDER BY close_time DESC';

    const args = symbol ? [symbol] : [];
    const rs = await db.execute({ sql, args });

    return rs.rows.map(rowToTrade);
}

export async function getShadowTrades(symbol?: string): Promise<Trade[]> {
    const db = await qs();
    const sql = symbol
        ? 'SELECT * FROM shadow_trades WHERE symbol = ? ORDER BY close_time DESC'
        : 'SELECT * FROM shadow_trades ORDER BY close_time DESC';
    const args = symbol ? [symbol] : [];
    const rs = await db.execute({ sql, args });
    return rs.rows.map(rowToTrade);
}

export async function getTradeStats() {
    const db = await qs();
    const rs = await db.execute(`
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
    `);

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
export async function getEquityCurve(startingBalance: number = 10000) {
    const db = await qs();
    const rs = await db.execute('SELECT close_time, pnl FROM trades ORDER BY close_time ASC');

    let balance = startingBalance;
    const points: { time: number; balance: number }[] = [];

    for (const row of rs.rows) {
        balance += Number(row.pnl);
        points.push({ time: Number(row.close_time), balance });
    }
    return points;
}

/** Compute max drawdown from equity curve */
export async function getDrawdownData(startingBalance: number = 10000) {
    const curve = await getEquityCurve(startingBalance);
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
export async function getSymbolStats() {
    const db = await qs();
    const rs = await db.execute(`
        SELECT
            symbol,
            COUNT(*) as trades,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
            SUM(pnl) as total_pnl,
            AVG(pnl) as avg_pnl
        FROM trades
        GROUP BY symbol
        ORDER BY total_pnl DESC
    `);

    return rs.rows.map(row => ({
        symbol: row.symbol as string,
        trades: Number(row.trades),
        wins: Number(row.wins),
        total_pnl: Number(row.total_pnl),
        avg_pnl: Number(row.avg_pnl),
    }));
}

// ─── Portfolio State ───────────────────────────────────────────

export async function savePortfolioState(portfolio: Portfolio): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            UPDATE portfolio_state
            SET balance = ?, positions_json = ?, updated_at = datetime('now')
            WHERE id = 1
        `,
        args: [
            portfolio.balance,
            JSON.stringify(portfolio.positions),
        ]
    });
}

export async function saveShadowPortfolioState(portfolio: Portfolio): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `
            UPDATE shadow_portfolio_state
            SET balance = ?, positions_json = ?
            WHERE id = 1
        `,
        args: [
            portfolio.balance,
            JSON.stringify(portfolio.positions),
        ]
    });
}

export async function loadPortfolioState(): Promise<{ balance: number; positions: Position[] }> {
    const db = await qs();
    const rs = await db.execute('SELECT balance, positions_json FROM portfolio_state WHERE id = 1');
    const row = rs.rows[0];

    if (!row) return { balance: 10000, positions: [] };
    return {
        balance: Number(row.balance),
        positions: JSON.parse((row.positions_json as string) || '[]'),
    };
}

export async function loadShadowPortfolioState(): Promise<{ balance: number; positions: Position[] }> {
    const db = await qs();
    const rs = await db.execute('SELECT balance, positions_json FROM shadow_portfolio_state WHERE id = 1');
    const row = rs.rows[0];

    if (!row) return { balance: 10000, positions: [] };
    return {
        balance: Number(row.balance),
        positions: JSON.parse((row.positions_json as string) || '[]'),
    };
}

// ─── Daily PnL ─────────────────────────────────────────────────

export async function getDailyPnL(table: 'trades' | 'shadow_trades' = 'trades') {
    const db = await qs();
    const rs = await db.execute(`
        SELECT
            date(close_time / 1000, 'unixepoch') as day,
            SUM(pnl) as daily_pnl,
            COUNT(*) as trade_count,
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
        FROM ${table}
        GROUP BY day
        ORDER BY day ASC
    `);

    return rs.rows.map(row => ({
        day: row.day as string,
        pnl: Number(row.daily_pnl || 0),
        trades: Number(row.trade_count || 0),
        wins: Number(row.wins || 0),
    }));
}

// ─── PnL Distribution ─────────────────────────────────────────

export async function getPnLDistribution(table: 'trades' | 'shadow_trades' = 'trades') {
    const db = await qs();
    const rs = await db.execute(`SELECT pnl FROM ${table} ORDER BY pnl ASC`);

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

export async function getShadowTradeStats() {
    const db = await qs();
    const rs = await db.execute(`
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
    `);

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

export async function getShadowEquityCurve(startingBalance: number = 10000) {
    const db = await qs();
    const rs = await db.execute('SELECT close_time, pnl FROM shadow_trades ORDER BY close_time ASC');

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

export async function saveShadowDecision(d: ShadowDecisionLog): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `INSERT INTO shadow_decisions (timestamp, symbol, action, score, reason, had_position, position_side, position_pnl_pct, executed, result)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            d.timestamp, d.symbol, d.action, d.score, d.reason,
            d.hadPosition ? 1 : 0, d.positionSide || null, d.positionPnlPct ?? null,
            d.executed ? 1 : 0, d.result || null,
        ],
    });
}

export async function getShadowDecisions(limit: number = 50): Promise<ShadowDecisionLog[]> {
    const db = await qs();
    const rs = await db.execute({
        sql: `SELECT * FROM shadow_decisions ORDER BY timestamp DESC LIMIT ?`,
        args: [limit],
    });

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
}

export async function savePushSubscription(subscription: { endpoint: string; [key: string]: unknown }): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: `INSERT OR REPLACE INTO push_subscriptions (endpoint, subscription_json) VALUES (?, ?)`,
        args: [subscription.endpoint, JSON.stringify(subscription)],
    });
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const db = await qs();
    const rs = await db.execute('SELECT endpoint, subscription_json FROM push_subscriptions');
    return rs.rows.map(row => ({
        endpoint: row.endpoint as string,
        subscription: JSON.parse(row.subscription_json as string),
    }));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
    const db = await qs();
    await db.execute({
        sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
        args: [endpoint],
    });
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
