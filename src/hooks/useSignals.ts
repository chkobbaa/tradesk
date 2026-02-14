
import { useState, useEffect, useMemo, useCallback } from 'react';
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
    const [results, setResults] = useState<SignalResult[]>([]);
    const [decision, setDecision] = useState<TradeDecision | null>(null);

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
        // Trigger re-evaluation immediately
        evaluateSignals();
    }, [macroSignal]); // evaluateSignals depends on signals, which is stable

    const evaluateSignals = useCallback(() => {
        if (!candles || candles.length === 0) return;

        const context = { candles, symbol: 'BTCUSDT' }; // default symbol for context
        const newResults = signals.map(s => s.evaluate(context));
        setResults(newResults);

        const newDecision = Resolver.resolve(newResults);
        setDecision(newDecision);
    }, [candles, signals]);

    // Re-evaluate when candles update
    useEffect(() => {
        evaluateSignals();
    }, [candles, evaluateSignals]);

    return {
        results,
        decision,
        macroSentiment,
        setMacroSentiment
    };
}
