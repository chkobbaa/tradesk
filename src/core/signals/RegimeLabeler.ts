
import { Candle } from '@/core/market/types';
import { calculateATR } from '@/core/indicators';
import { calculateEMA } from '@/core/indicators';

/**
 * Regime Labeler — Context Only
 *
 * Labels the current market regime as one of:
 *   TRENDING | RANGING | HIGH_VOLATILITY | EVENT_DRIVEN | UNCLEAR
 *
 * This label does NOT influence trade decisions.
 * It only provides context for the operator (you) to understand what the bot sees.
 */

export type RegimeLabel = 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'EVENT_DRIVEN' | 'UNCLEAR';

export interface RegimeResult {
    label: RegimeLabel;
    reason: string;
    confidence: number; // 0.0 to 1.0
    timestamp: number;
}

export class RegimeLabeler {

    /**
     * Analyze candles and classify the market regime.
     * Requires at least 30 candles for meaningful analysis.
     */
    static label(candles: Candle[]): RegimeResult {
        if (candles.length < 30) {
            return {
                label: 'UNCLEAR',
                reason: 'Insufficient data (need ≥30 candles)',
                confidence: 0,
                timestamp: Date.now(),
            };
        }

        const price = candles[candles.length - 1].close;

        // ─── 1. ATR-based volatility check ──────────────────────
        const atrSeries = calculateATR(candles, 14);
        const currentATR = atrSeries[atrSeries.length - 1]?.value ?? 0;
        const atrPct = (currentATR / price) * 100;

        // ─── 2. Event detection: single candle spike ────────────
        // Look at last 5 candles for abnormal body size
        const recentCandles = candles.slice(-20);
        const avgBody = recentCandles.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / recentCandles.length;
        const lastCandle = candles[candles.length - 1];
        const lastBody = Math.abs(lastCandle.close - lastCandle.open);

        if (lastBody > avgBody * 3.0 && atrPct > 1.5) {
            return {
                label: 'EVENT_DRIVEN',
                reason: `Candle body ($${lastBody.toFixed(0)}) is ${(lastBody / avgBody).toFixed(1)}× avg ($${avgBody.toFixed(0)}). ATR: ${atrPct.toFixed(2)}%`,
                confidence: Math.min(lastBody / avgBody / 5, 1.0),
                timestamp: Date.now(),
            };
        }

        // ─── 3. High volatility check ───────────────────────────
        // Compare current ATR to average ATR over longer lookback
        const atrLookback = atrSeries.slice(-20);
        const avgATR = atrLookback.reduce((s, a) => s + a.value, 0) / atrLookback.length;
        const atrRatio = currentATR / avgATR;

        if (atrPct > 2.5 || atrRatio > 1.8) {
            return {
                label: 'HIGH_VOLATILITY',
                reason: `ATR ${atrPct.toFixed(2)}% of price (ratio to avg: ${atrRatio.toFixed(2)}×). Elevated risk.`,
                confidence: Math.min(atrPct / 4, 1.0),
                timestamp: Date.now(),
            };
        }

        // ─── 4. Trend detection ─────────────────────────────────
        // Use EMA20 slope + directional consistency of recent candles
        const ema20 = calculateEMA(candles, 20);
        if (ema20.length >= 10) {
            const recentEma = ema20.slice(-10);
            const emaStart = recentEma[0].value;
            const emaEnd = recentEma[recentEma.length - 1].value;
            const emaSlopePct = ((emaEnd - emaStart) / emaStart) * 100;

            // Count consecutive directional candles (last 10)
            const last10 = candles.slice(-10);
            let bullish = 0;
            let bearish = 0;
            for (const c of last10) {
                if (c.close > c.open) bullish++;
                else bearish++;
            }
            const directionality = Math.max(bullish, bearish) / 10;

            if (Math.abs(emaSlopePct) > 0.5 && directionality >= 0.7) {
                const dir = emaSlopePct > 0 ? 'Bullish' : 'Bearish';
                return {
                    label: 'TRENDING',
                    reason: `${dir} trend: EMA20 slope ${emaSlopePct > 0 ? '+' : ''}${emaSlopePct.toFixed(2)}%, ${Math.max(bullish, bearish)}/10 candles aligned.`,
                    confidence: Math.min(Math.abs(emaSlopePct) / 2, 1.0),
                    timestamp: Date.now(),
                };
            }
        }

        // ─── 5. Range detection ─────────────────────────────────
        // Price oscillating — low ATR, price close to its 20-period mean
        const last20Closes = candles.slice(-20).map(c => c.close);
        const mean20 = last20Closes.reduce((s, v) => s + v, 0) / last20Closes.length;
        const maxDev = Math.max(...last20Closes.map(v => Math.abs(v - mean20)));
        const maxDevPct = (maxDev / mean20) * 100;

        if (atrPct < 1.5 && maxDevPct < 2.0) {
            return {
                label: 'RANGING',
                reason: `Tight range: max deviation ${maxDevPct.toFixed(2)}% from mean. ATR: ${atrPct.toFixed(2)}% — sideways chop.`,
                confidence: Math.min((2.0 - maxDevPct) / 2.0 + 0.3, 1.0),
                timestamp: Date.now(),
            };
        }

        // ─── 6. Default: Unclear ────────────────────────────────
        return {
            label: 'UNCLEAR',
            reason: `Mixed signals. ATR: ${atrPct.toFixed(2)}%, range deviation: ${maxDevPct.toFixed(2)}%. No clear regime.`,
            confidence: 0.3,
            timestamp: Date.now(),
        };
    }
}
