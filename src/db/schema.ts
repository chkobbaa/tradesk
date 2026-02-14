
import { createClient, Client } from '@libsql/client';

const URL = process.env.TURSO_DATABASE_URL || 'file:tradesk.db';
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

export function getClient(): Client {
    if (!_client) {
        _client = createClient({
            url: URL,
            authToken: AUTH_TOKEN,
        });
    }
    return _client;
}

export async function ensureSchema(): Promise<void> {
    if (_initPromise) return _initPromise;

    const client = getClient();
    _initPromise = (async () => {
        // Trade table
        await client.execute(`
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL CHECK(side IN ('LONG', 'SHORT')),
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                quantity REAL NOT NULL,
                stop_loss REAL,
                take_profit REAL,
                open_time INTEGER NOT NULL,
                close_time INTEGER NOT NULL,
                entry_fee REAL NOT NULL DEFAULT 0,
                exit_fee REAL NOT NULL DEFAULT 0,
                pnl REAL NOT NULL,
                indicator_snapshot TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);

        // Portfolio state table
        await client.execute(`
            CREATE TABLE IF NOT EXISTS portfolio_state (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                balance REAL NOT NULL DEFAULT 10000,
                positions_json TEXT DEFAULT '[]',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        // Seed portfolio if empty
        await client.execute(`
            INSERT OR IGNORE INTO portfolio_state (id, balance) VALUES (1, 10000)
        `);

        // Indices
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_trades_close_time ON trades(close_time)`);

        // ─── Shadow Mode ─────────────────────────────────────────────

        // Shadow Trades
        await client.execute(`
            CREATE TABLE IF NOT EXISTS shadow_trades (
                id TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                quantity REAL NOT NULL,
                stop_loss REAL,
                take_profit REAL,
                open_time INTEGER NOT NULL,
                close_time INTEGER NOT NULL,
                entry_fee REAL NOT NULL DEFAULT 0,
                exit_fee REAL NOT NULL DEFAULT 0,
                pnl REAL NOT NULL,
                indicator_snapshot TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);

        // Shadow Indices
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_shadow_trades_symbol ON shadow_trades(symbol)`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_shadow_trades_close_time ON shadow_trades(close_time)`);

        // Shadow Portfolio
        await client.execute(`
            CREATE TABLE IF NOT EXISTS shadow_portfolio_state (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                balance REAL NOT NULL DEFAULT 10000,
                positions_json TEXT DEFAULT '[]',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        // Seed Shadow Portfolio
        await client.execute(`
            INSERT OR IGNORE INTO shadow_portfolio_state (id, balance) VALUES (1, 10000)
        `);
    })();

    return _initPromise;
}
