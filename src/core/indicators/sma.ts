/**
 * Simple Moving Average (SMA)
 *
 * SMA = sum of close prices over N periods / N
 * Uses a sliding window for O(n) computation.
 */

import { Candle } from '@/core/market/types';
import { IndicatorPoint } from './types';

export function calculateSMA(candles: Candle[], period: number): IndicatorPoint[] {
    if (candles.length < period || period <= 0) return [];

    const result: IndicatorPoint[] = [];
    let sum = 0;

    // Initial window
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    result.push({ time: candles[period - 1].time, value: sum / period });

    // Slide the window
    for (let i = period; i < candles.length; i++) {
        sum += candles[i].close - candles[i - period].close;
        result.push({ time: candles[i].time, value: sum / period });
    }

    return result;
}
