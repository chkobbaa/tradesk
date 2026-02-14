
import { SignalGenerator, SignalContext, SignalResult } from './types';
import { calculateRSI } from '@/core/indicators';

export class RsiSignal implements SignalGenerator {
    name = 'Momentum-RSI';

    evaluate(context: SignalContext): SignalResult {
        const { candles } = context;
        if (candles.length < 14) {
            return {
                source: this.name,
                direction: 'NEUTRAL',
                confidence: 0,
                horizon: 'SCALP',
                reason: 'Insufficient data for RSI',
                timestamp: Date.now(),
            };
        }

        const rsiSeries = calculateRSI(candles, 14);
        const lastRsi = rsiSeries[rsiSeries.length - 1].value;

        if (lastRsi > 70) {
            return {
                source: this.name,
                direction: 'SHORT', // Mean reversion
                confidence: (lastRsi - 70) / 30 + 0.5, // Higher RSI = Higher confidence
                horizon: 'SCALP',
                reason: `RSI (${lastRsi.toFixed(1)}) is Overbought (>70)`,
                timestamp: Date.now(),
            };
        } else if (lastRsi < 30) {
            return {
                source: this.name,
                direction: 'LONG', // Mean reversion
                confidence: (30 - lastRsi) / 30 + 0.5,
                horizon: 'SCALP',
                reason: `RSI (${lastRsi.toFixed(1)}) is Oversold (<30)`,
                timestamp: Date.now(),
            };
        } else {
            return {
                source: this.name,
                direction: 'NEUTRAL',
                confidence: 0.5,
                horizon: 'SCALP',
                reason: `RSI (${lastRsi.toFixed(1)}) is Neutral`,
                timestamp: Date.now(),
            };
        }
    }
}
