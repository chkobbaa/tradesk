
import { SignalGenerator, SignalContext, SignalResult } from './types';
import { calculateEMA } from '@/core/indicators';

export class TrendSignal implements SignalGenerator {
    name = 'Trend-EMA';

    evaluate(context: SignalContext): SignalResult {
        const { candles } = context;
        if (candles.length < 200) {
            return {
                source: this.name,
                direction: 'NEUTRAL',
                confidence: 0,
                horizon: 'SWING',
                reason: 'Insufficient data for EMA200',
                timestamp: Date.now(),
            };
        }

        const ema200 = calculateEMA(candles, 200);
        const lastCandle = candles[candles.length - 1];
        const lastEma = ema200[ema200.length - 1].value;
        const price = lastCandle.close;

        if (price > lastEma) {
            return {
                source: this.name,
                direction: 'LONG',
                confidence: 0.8,
                horizon: 'SWING',
                reason: `Price ($${price.toFixed(2)}) > EMA200 ($${lastEma.toFixed(2)})`,
                timestamp: Date.now(),
            };
        } else {
            return {
                source: this.name,
                direction: 'SHORT',
                confidence: 0.8,
                horizon: 'SWING',
                reason: `Price ($${price.toFixed(2)}) < EMA200 ($${lastEma.toFixed(2)})`,
                timestamp: Date.now(),
            };
        }
    }
}
