
import { SignalResult, SignalDirection } from './types';

export interface TradeDecision {
    action: 'BUY' | 'SELL' | 'HOLD';
    size: number; // 0.0 to 1.0
    reason: string;
    score: number; // -1.0 to 1.0
    timestamp: number;
}

export class Resolver {
    // Weights
    private static WEIGHTS = {
        TREND: 0.4,
        MOMENTUM: 0.3,
        MACRO: 0.3,
    };

    private static THRESHOLD = 0.2; // Score must exceed this to trade (Aggressive Mode: 0.2 allows single signal trigger)

    static resolve(signals: SignalResult[]): TradeDecision {
        let totalScore = 0;
        let reasons: string[] = [];

        // Find specific signals
        const trend = signals.find(s => s.source === 'Trend-EMA');
        const rsi = signals.find(s => s.source === 'Momentum-RSI');
        const macro = signals.find(s => s.source === 'Macro-Manual');
        const vol = signals.find(s => s.source === 'Volatility-ATR');

        // Helper to convert direction to score (-1, 0, 1)
        const getScore = (dir: SignalDirection) => {
            if (dir === 'LONG') return 1;
            if (dir === 'SHORT') return -1;
            return 0;
        };

        // 1. Trend Contribution
        if (trend) {
            const score = getScore(trend.direction) * trend.confidence;
            totalScore += score * this.WEIGHTS.TREND;
            if (trend.direction !== 'NEUTRAL') {
                reasons.push(`Trend ${trend.direction} (${(score * this.WEIGHTS.TREND).toFixed(2)})`);
            }
        }

        // 2. Momentum Contribution
        if (rsi) {
            const score = getScore(rsi.direction) * rsi.confidence;
            totalScore += score * this.WEIGHTS.MOMENTUM;
            if (rsi.direction !== 'NEUTRAL') {
                reasons.push(`RSI ${rsi.direction} (${(score * this.WEIGHTS.MOMENTUM).toFixed(2)})`);
            }
        }

        // 3. Macro Contribution
        if (macro) {
            const score = getScore(macro.direction) * macro.confidence;
            totalScore += score * this.WEIGHTS.MACRO;
            if (macro.direction !== 'NEUTRAL') {
                reasons.push(`Macro ${macro.direction} (${(score * this.WEIGHTS.MACRO).toFixed(2)})`);
            }
        }

        // 4. Volatility Check (Gatekeeper)
        // If volatility is effectively zero or too low (from indicator?), we might reduce size.
        // But our VolatilitySignal currently returns NEUTRAL with high/low confidence depending on 'Rising' logic.
        // Let's just use it to append a note for now.
        if (vol) {
            reasons.push(`[Vol: ${vol.reason}]`);
        }

        // Final Decision
        let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        if (totalScore > this.THRESHOLD) action = 'BUY';
        else if (totalScore < -this.THRESHOLD) action = 'SELL';

        // Size scaling based on strength (0.5 to 1.0)
        let size = Math.min(Math.abs(totalScore), 1.0);
        if (action === 'HOLD') size = 0;

        return {
            action,
            size,
            score: totalScore,
            reason: reasons.join(' | ') || 'No signals',
            timestamp: Date.now(),
        };
    }
}
