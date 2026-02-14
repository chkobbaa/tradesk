
import { Candle } from '@/core/market/types';
import { TrendSignal } from '@/core/signals/TrendSignal';
import { RsiSignal } from '@/core/signals/RsiSignal';
import { VolatilitySignal } from '@/core/signals/VolatilitySignal';
// MacroSignal is manual, so for Cron we might need to fetch it from DB or defaults to NEUTRAL?
// Or we can store Macro state in DB?
import { Resolver, TradeDecision } from '@/core/signals/Resolver';
import { SignalResult } from '@/core/signals/types';

export class TradingEngine {
    private signals = [
        new TrendSignal(),
        new RsiSignal(),
        new VolatilitySignal(),
        // TODO: MacroSignal needs state. For now, we omit it or assume Neutral.
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
            reason: `Manual Overrride: ${macroSentiment}`,
            timestamp: Date.now()
        });

        return Resolver.resolve(results);
    }
}
