
import { Candle } from '@/core/market/types';

export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';
export type SignalHorizon = 'SCALP' | 'INTRADAY' | 'SWING';

export interface SignalResult {
    source: string;       // e.g., "Trend-EMA"
    direction: SignalDirection;
    confidence: number;   // 0.0 to 1.0
    horizon: SignalHorizon;
    reason: string;       // e.g., "Price (50200) > EMA200 (49800)"
    timestamp: number;
}

export interface SignalContext {
    candles: Candle[];
    symbol: string;
    indicators?: any; // Pre-calculated indicators if needed, or signals calculate their own
}

export interface SignalGenerator {
    name: string;
    evaluate(context: SignalContext): SignalResult;
}
