/**
 * Shared utility functions.
 */

/**
 * Format a number as a price string with appropriate decimal places.
 * Automatically determines precision based on the value.
 */
export function formatPrice(value: number): string {
    if (value >= 1000) return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (value >= 1) return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (value >= 0.01) return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

/**
 * Format volume with abbreviations (K, M, B).
 */
export function formatVolume(value: number): string {
    if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B';
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K';
    return value.toFixed(2);
}

/**
 * Format a Unix timestamp (seconds) to a readable date/time string.
 */
export function formatTime(timestamp: number, timeframe: string): string {
    const date = new Date(timestamp * 1000);

    if (timeframe === '1d') {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/**
 * Calculate percentage change between two values.
 */
export function percentChange(from: number, to: number): number {
    if (from === 0) return 0;
    return ((to - from) / from) * 100;
}

/**
 * Format percentage with sign and fixed decimals.
 */
export function formatPercent(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}
