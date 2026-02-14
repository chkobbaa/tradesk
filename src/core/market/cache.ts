/**
 * Simple in-memory cache with TTL.
 * Used to avoid hammering the Binance API on every request.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class MemoryCache {
    private store = new Map<string, CacheEntry<unknown>>();

    /**
     * Get cached value if it exists and hasn't expired.
     */
    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.data as T;
    }

    /**
     * Set a value with a TTL in seconds.
     */
    set<T>(key: string, data: T, ttlSeconds: number): void {
        this.store.set(key, {
            data,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    /**
     * Get a value from cache, or fetch it if missing/expired.
     */
    async getOrFetch<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttlSeconds: number,
    ): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== null) return cached;

        const data = await fetcher();
        this.set(key, data, ttlSeconds);
        return data;
    }

    /**
     * Clear all cache entries.
     */
    clear(): void {
        this.store.clear();
    }

    /**
     * Number of entries in cache (including expired).
     */
    get size(): number {
        return this.store.size;
    }
}

// Singleton cache instance for the API layer
export const marketCache = new MemoryCache();

// TTL constants
export const CANDLE_TTL = 30;      // 30 seconds for live candle data
export const SYMBOLS_TTL = 3600;   // 1 hour for symbol list
