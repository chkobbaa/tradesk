
import { SignalGenerator, SignalContext, SignalResult } from './types';
import { calculateATR } from '@/core/indicators';

export class VolatilitySignal implements SignalGenerator {
    name = 'Volatility-ATR';

    evaluate(context: SignalContext): SignalResult {
        const { candles } = context;
        if (candles.length < 14) {
            return {
                source: this.name,
                direction: 'NEUTRAL',
                confidence: 0,
                horizon: 'INTRADAY',
                reason: 'Insufficient data',
                timestamp: Date.now(),
            };
        }

        const atrSeries = calculateATR(candles, 14);
        const currentATR = atrSeries[atrSeries.length - 1].value;
        const prevATR = atrSeries[atrSeries.length - 2]?.value || currentATR;

        // Simple logic: If ATR is rising, volatility is increasing.
        // This usually signals a breakout or strong move.
        // But direction is unknown from ATR itself.
        // We return NEUTRAL but with high confidence if volatility is high.
        // Or we can say: High Volatility = CAUTION.

        // Let's use it as a "Regime" detector.
        // For now, let's just output Neutral but describe the state.

        const isRising = currentATR > prevATR;

        return {
            source: this.name,
            direction: 'NEUTRAL',
            confidence: isRising ? 0.8 : 0.2, // High confidence that volatility is High
            horizon: 'INTRADAY',
            reason: `ATR is ${isRising ? 'Rising' : 'Falling'} (${currentATR.toFixed(2)})`,
            timestamp: Date.now(),
        };
    }
}
