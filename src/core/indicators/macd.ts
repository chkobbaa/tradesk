/**
 * MACD (Moving Average Convergence Divergence)
 *
 * MACD Line    = EMA(fast) − EMA(slow)
 * Signal Line  = EMA(MACD Line, signal period)
 * Histogram    = MACD Line − Signal Line
 */

import { Candle } from '@/core/market/types';
import { MACDPoint } from './types';
import { emaFromValues } from './ema';

export function calculateMACD(
    candles: Candle[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
): MACDPoint[] {
    if (candles.length < slowPeriod + signalPeriod) return [];

    const closes = candles.map(c => c.close);

    // EMA fast and slow (over raw close prices)
    const emaFast = emaFromValues(closes, fastPeriod);
    const emaSlow = emaFromValues(closes, slowPeriod);

    // Align: emaFast starts at index (fastPeriod-1), emaSlow at (slowPeriod-1)
    // MACD line starts where both are available
    const fastOffset = fastPeriod - 1;
    const slowOffset = slowPeriod - 1;

    const macdLine: number[] = [];
    const macdTimes: number[] = [];

    for (let i = 0; i < emaSlow.length; i++) {
        const slowIdx = i;
        const fastIdx = i + (slowOffset - fastOffset);
        if (fastIdx < 0 || fastIdx >= emaFast.length) continue;

        macdLine.push(emaFast[fastIdx] - emaSlow[slowIdx]);
        macdTimes.push(candles[slowOffset + i].time);
    }

    // Signal line = EMA of MACD line
    const signalLine = emaFromValues(macdLine, signalPeriod);

    // Build output — aligned to signal line start
    const signalOffset = signalPeriod - 1;
    const result: MACDPoint[] = [];

    for (let i = 0; i < signalLine.length; i++) {
        const macdIdx = signalOffset + i;
        if (macdIdx >= macdLine.length) break;

        const macd = macdLine[macdIdx];
        const signal = signalLine[i];
        result.push({
            time: macdTimes[macdIdx],
            macd,
            signal,
            histogram: macd - signal,
        });
    }

    return result;
}
