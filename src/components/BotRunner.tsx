import { useEffect, useCallback } from 'react';
import { useShadowTrader } from '@/hooks/useShadowTrader';
import { useSignals } from '@/hooks/useSignals';
import { Candle } from '@/core/market/types';
import { useBinanceStream } from '@/lib/useBinanceStream';
import { useState } from 'react';

import { Portfolio } from '@/core/trading/types';

interface BotRunnerProps {
    symbol: string;
    isActive: boolean;
    portfolio: Portfolio;
    onUpdatePortfolio: (p: Portfolio) => void;
}

export function BotRunner({ symbol, isActive, portfolio, onUpdatePortfolio }: BotRunnerProps) {
    const [candles, setCandles] = useState<Candle[]>([]);
    const [lastClosedCandle, setLastClosedCandle] = useState<Candle | null>(null);

    // Initial fetch
    useEffect(() => {
        if (!isActive) return;
        fetch(`/api/candles?symbol=${symbol}&timeframe=1h&limit=200`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setCandles(data);
            })
            .catch(err => console.error(`Failed to fetch ${symbol} candles:`, err));
    }, [symbol, isActive]);

    // WebSocket updates
    const handleStreamUpdate = useCallback((candle: Candle, isClosed: boolean) => {
        setCandles(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const updatedLastIdx = updated.length - 1;
            if (updated[updatedLastIdx].time === candle.time) {
                updated[updatedLastIdx] = candle;
            } else if (isClosed || candle.time > updated[updatedLastIdx].time) {
                updated.push(candle);
                if (updated.length > 200) updated.shift();
            }
            return updated;
        });
        if (isClosed) {
            setLastClosedCandle(candle);
        }
    }, []);

    useBinanceStream({
        symbol,
        timeframe: '1h',
        onUpdate: handleStreamUpdate,
        enabled: isActive && candles.length > 0,
    });

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

    // Signal Logic
    const { decision } = useSignals(candles);

    // Trading Logic
    useShadowTrader(decision, currentPrice, symbol, lastClosedCandle, portfolio, onUpdatePortfolio);

    return null; // Headless component
}
