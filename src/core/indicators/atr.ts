import { Candle } from '@/core/market/types';

/**
 * Calculates Average True Range (ATR)
 * ATR is a measure of volatility.
 * 
 * TR = Max(High - Low, |High - PrevClose|, |Low - PrevClose|)
 * ATR = Moving Average of TR (usually Wilder's Smoothing)
 */
export function calculateATR(candles: Candle[], period: number = 14): { time: string | number, value: number }[] {
    if (candles.length < period + 1) return [];

    const trs: number[] = [];

    // Calculate True Range for each candle (starting from index 1 because we need prev close)
    // For index 0, TR is High - Low
    trs.push(candles[0].high - candles[0].low);

    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trs.push(tr);
    }

    // First ATR is simple average of first 'period' TRs
    let atr = trs.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    const result: { time: string | number, value: number }[] = [];

    // Push first ATR point (at index period-1)
    result.push({ time: candles[period - 1].time, value: atr });

    // Subsequent ATRs using Wilder's Smoothing: ATR = ((Prev ATR * (n-1)) + Current TR) / n
    for (let i = period; i < candles.length; i++) {
        const currentTR = trs[i];
        atr = ((atr * (period - 1)) + currentTR) / period;
        result.push({ time: candles[i].time, value: atr });
    }

    return result;
}
