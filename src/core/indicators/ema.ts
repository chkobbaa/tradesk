/**
 * Exponential Moving Average (EMA)
 *
 * EMA = close × k + EMA_prev × (1 − k)
 * where k = 2 / (period + 1)
 *
 * The first EMA value is seeded with the SMA of the first `period` candles.
 */

import { Candle } from '@/core/market/types';
import { IndicatorPoint } from './types';

export function calculateEMA(candles: Candle[], period: number): IndicatorPoint[] {
    if (candles.length < period || period <= 0) return [];

    const k = 2 / (period + 1);
    const result: IndicatorPoint[] = [];

    // Seed with SMA of the first `period` values
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    let ema = sum / period;
    result.push({ time: candles[period - 1].time, value: ema });

    // Recursive EMA
    for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
        result.push({ time: candles[i].time, value: ema });
    }

    return result;
}

/**
 * EMA over raw values (not candles). Used internally by MACD.
 */
export function emaFromValues(values: number[], period: number): number[] {
    if (values.length < period || period <= 0) return [];

    const k = 2 / (period + 1);
    const result: number[] = [];

    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[i];
    }
    let ema = sum / period;
    result.push(ema);

    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
        result.push(ema);
    }

    return result;
}
