
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

// ─── Helpers ───────────────────────────────────────────────────

function rowToTrade(row: any): Trade {
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
