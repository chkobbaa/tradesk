
import { useState, useMemo, useCallback } from 'react';
import { Candle } from '@/core/market/types';
import {
    SignalResult,
    SignalGenerator,
    TrendSignal,
    RsiSignal,
    VolatilitySignal,
    MacroSignal,
    SignalDirection,
    Resolver,
    TradeDecision
} from '@/core/signals';

export function useSignals(candles: Candle[]) {
    // Instantiate signals once
    const signals = useMemo<SignalGenerator[]>(() => [
        new TrendSignal(),
        new RsiSignal(),
        new VolatilitySignal(),
        new MacroSignal(), // This one has state
    ], []);

    // Helper to find MacroSignal instance
    const macroSignal = useMemo(() =>
        signals.find(s => s instanceof MacroSignal) as MacroSignal
        , [signals]);

    const [macroSentiment, setMacroSentimentState] = useState<SignalDirection>('NEUTRAL');

    // Update MacroSignal state when UI changes
    const setMacroSentiment = useCallback((sentiment: SignalDirection) => {
        setMacroSentimentState(sentiment);
        macroSignal.setSentiment(sentiment);
    }, [macroSignal]);

    const { results, decision } = useMemo<{ results: SignalResult[]; decision: TradeDecision | null }>(() => {
        if (!candles || candles.length === 0) {
            return { results: [], decision: null };
        }

        const context = { candles, symbol: 'BTCUSDT' }; // default symbol for context
        const nextResults = signals.map(s => s.evaluate(context));
        const nextDecision = Resolver.resolve(nextResults);

        return { results: nextResults, decision: nextDecision };
    }, [candles, signals, macroSentiment]);

    return {
        results,
        decision,
        macroSentiment,
        setMacroSentiment
    };
}
