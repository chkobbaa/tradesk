
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
                user_id TEXT,
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

        await client.execute(`
            CREATE TABLE IF NOT EXISTS portfolio_state_user (
                user_id TEXT PRIMARY KEY,
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

        try {
            await client.execute(`ALTER TABLE trades ADD COLUMN user_id TEXT`);
        } catch {
            // Column already exists.
        }

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id)`);

        // ─── Shadow Mode ─────────────────────────────────────────────

        // Shadow Trades
        await client.execute(`
            CREATE TABLE IF NOT EXISTS shadow_trades (
                id TEXT PRIMARY KEY,
                user_id TEXT,
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

        try {
            await client.execute(`ALTER TABLE shadow_trades ADD COLUMN user_id TEXT`);
        } catch {
            // Column already exists.
        }

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_shadow_trades_user_id ON shadow_trades(user_id)`);

        // Shadow Portfolio
        await client.execute(`
            CREATE TABLE IF NOT EXISTS shadow_portfolio_state (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                balance REAL NOT NULL DEFAULT 10000,
                positions_json TEXT DEFAULT '[]',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS shadow_portfolio_state_user (
                user_id TEXT PRIMARY KEY,
                balance REAL NOT NULL DEFAULT 10000,
                positions_json TEXT DEFAULT '[]',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        // Seed Shadow Portfolio
        await client.execute(`
            INSERT OR IGNORE INTO shadow_portfolio_state (id, balance) VALUES (1, 10000)
        `);

        // Shadow Decision Log (bot thoughts)
        await client.execute(`
            CREATE TABLE IF NOT EXISTS shadow_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                timestamp INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                action TEXT NOT NULL,
                score REAL NOT NULL,
                reason TEXT NOT NULL,
                had_position INTEGER NOT NULL DEFAULT 0,
                position_side TEXT,
                position_pnl_pct REAL,
                executed INTEGER NOT NULL DEFAULT 0,
                result TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_shadow_decisions_ts ON shadow_decisions(timestamp)`);

        try {
            await client.execute(`ALTER TABLE shadow_decisions ADD COLUMN user_id TEXT`);
        } catch {
            // Column already exists.
        }

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_shadow_decisions_user_id ON shadow_decisions(user_id)`);

        // ─── Push Notifications ──────────────────────────────────────

        await client.execute(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint TEXT PRIMARY KEY,
                subscription_json TEXT NOT NULL,
                user_id TEXT,
                device_id TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);

        try {
            await client.execute(`ALTER TABLE push_subscriptions ADD COLUMN user_id TEXT`);
        } catch {
            // Column already exists on migrated databases.
        }

        try {
            await client.execute(`ALTER TABLE push_subscriptions ADD COLUMN device_id TEXT`);
        } catch {
            // Column already exists on migrated databases.
        }

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id ON push_subscriptions(device_id)`);

        // ─── Chat Messages ───────────────────────────────────────────────

        await client.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_id TEXT NOT NULL,
                to_id TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_chat_from_to_ts ON chat_messages(from_id, to_id, timestamp DESC)`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_chat_to_from_ts ON chat_messages(to_id, from_id, timestamp DESC)`);

        // ─── Chat Identities ─────────────────────────────────────────────

        await client.execute(`
            CREATE TABLE IF NOT EXISTS chat_identities (
                device_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE,
                created_at TEXT DEFAULT (datetime('now'))
            )
        `);

        await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_identities_user_id ON chat_identities(user_id)`);

        // ─── Chat Contacts ───────────────────────────────────────────────

        await client.execute(`
            CREATE TABLE IF NOT EXISTS chat_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id TEXT NOT NULL,
                contact_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(owner_id, contact_id)
            )
        `);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_chat_contacts_owner ON chat_contacts(owner_id)`);

        // ─── Chat Attachments ───────────────────────────────────────────

        await client.execute(`
            CREATE TABLE IF NOT EXISTS chat_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                file_name TEXT NOT NULL,
                file_url TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
            )
        `);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id)`);
    })();

    return _initPromise;
}
