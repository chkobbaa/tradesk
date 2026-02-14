/**
 * Relative Strength Index (RSI)
 *
 * RSI = 100 − 100 / (1 + RS)
 * RS  = avg gain / avg loss over `period` candles
 *
 * Uses Wilder's smoothing (exponential moving average of gains/losses).
 */

import { Candle } from '@/core/market/types';
import { IndicatorPoint } from './types';

export function calculateRSI(candles: Candle[], period: number): IndicatorPoint[] {
    if (candles.length < period + 1 || period <= 0) return [];

    const result: IndicatorPoint[] = [];

    // Calculate price changes
    const changes: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        changes.push(candles[i].close - candles[i - 1].close);
    }

    // First avg gain / avg loss (SMA of first `period` changes)
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] >= 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    // First RSI value
    const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);
    result.push({ time: candles[period].time, value: rsi0 });

    // Wilder's smoothing for subsequent values
    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] >= 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
        result.push({ time: candles[i + 1].time, value: rsi });
    }

    return result;
}
