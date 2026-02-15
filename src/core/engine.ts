
import { Candle } from '@/core/market/types';
import { TrendSignal } from '@/core/signals/TrendSignal';
import { RsiSignal } from '@/core/signals/RsiSignal';
import { VolatilitySignal } from '@/core/signals/VolatilitySignal';
import { Resolver, TradeDecision } from '@/core/signals/Resolver';
import { RegimeLabeler } from '@/core/signals/RegimeLabeler';
import { SignalResult } from '@/core/signals/types';

export class TradingEngine {
    private signals = [
        new TrendSignal(),
        new RsiSignal(),
        new VolatilitySignal(),
    ];

    public evaluate(candles: Candle[], symbol: string, macroSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL'): TradeDecision {
        const context = {
            candles,
            symbol,
            currentPrice: candles[candles.length - 1].close,
            index: candles.length - 1
        };

        const results: SignalResult[] = this.signals.map(s => s.evaluate(context));

        // Inject Macro Signal Manually since it's not a class that computes from candles
        results.push({
            source: 'Macro-Manual',
            direction: macroSentiment === 'RISK_ON' ? 'LONG' : (macroSentiment === 'RISK_OFF' ? 'SHORT' : 'NEUTRAL'),
            confidence: 1.0,
            horizon: 'SWING',
            reason: `Manual Override: ${macroSentiment}`,
            timestamp: Date.now()
        });

        const decision = Resolver.resolve(results);

        // Regime labeling — context only, does not influence BUY/SELL/HOLD
        const regime = RegimeLabeler.label(candles);
        decision.regime = regime.label;
        decision.regimeReason = regime.reason;

        return decision;
    }
}
