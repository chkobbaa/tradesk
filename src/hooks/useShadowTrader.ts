
import { useState, useEffect, useRef, useCallback } from 'react';
import { TradeDecision } from '@/core/signals';
import { Portfolio, Position } from '@/core/trading/types';
import { createPortfolio, openPosition, closePosition } from '@/core/trading';

/**
 * Shadow Trader Hook
 * Executes trades based on Signal Decisions for a separate Shadow Portfolio.
 */
import { Candle } from '@/core/market/types';

export function useShadowTrader(
    decision: TradeDecision | null,
    currentPrice: number,
    symbol: string,
    lastClosedCandle: Candle | null
) {
    const [portfolio, setPortfolio] = useState<Portfolio>(createPortfolio);
    const [loaded, setLoaded] = useState(false);

    // Track last processed decision timestamp to avoid re-execution
    const lastProcessedTime = useRef<number>(0);

    // Load shadow portfolio on mount
    useEffect(() => {
        fetch('/api/shadow/portfolio')
            .then(res => res.json())
            .then(data => {
                setPortfolio({
                    balance: data.balance,
                    positions: data.positions,
                    trades: []
                });
                setLoaded(true);
            });
    }, []);

    // Save portfolio on change
    useEffect(() => {
        if (!loaded) return;
        fetch('/api/shadow/portfolio', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(portfolio)
        }).catch(err => console.error('Failed to save shadow portfolio:', err));
    }, [portfolio, loaded]);

    // Persist Trade Helper
    const persistShadowTrade = useCallback((trade: any) => {
        fetch('/api/shadow/trades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade })
        }).catch(err => console.error('Failed to save shadow trade:', err));
    }, []);

    // Execution Logic
    useEffect(() => {
        if (!loaded || !decision || !lastClosedCandle || currentPrice <= 0) return;

        // Only process new decisions (based on timestamp)
        if (decision.timestamp <= lastProcessedTime.current) return;

        lastProcessedTime.current = decision.timestamp;

        // Verify "Confidence" / "Score" threshold?
        // Resolver already handled threshold. If action is BUY/SELL, it's valid.

        const existingPosition = portfolio.positions.find(p => p.symbol === symbol);

        setPortfolio(prev => {
            let next = { ...prev };

            // 1. BUY Signal
            if (decision.action === 'BUY') {
                // If we are Short, Close Short first
                if (existingPosition && existingPosition.side === 'SHORT') {
                    next = closePosition(next, existingPosition.id, currentPrice);
                    const closedTrade = next.trades[next.trades.length - 1]; // logic in closePosition adds to trades? 
                    // Wait, closePosition returns updated portfolio. 
                    // We need to capture the trade.
                    if (closedTrade) persistShadowTrade(closedTrade);
                }

                // If we are Flat, Open Long
                // (If we were Short, we just closed it, so now we are Flat)
                const isFlat = !next.positions.some(p => p.symbol === symbol);
                if (isFlat) {
                    const quantity = (next.balance * 0.95) / currentPrice; // Full degen mode (95% equity) or use decision.size?
                    // decision.size is 0.5 to 1.0.
                    const size = decision.size || 0.5;
                    const q = (next.balance * size * 0.95) / currentPrice;

                    if (q > 0) {
                        next = openPosition(next, {
                            symbol,
                            side: 'LONG',
                            quantity: q,
                            entryPrice: currentPrice,
                            stopLoss: null,
                            takeProfit: null,
                        });
                    }
                }
            }
            // 2. SELL Signal
            else if (decision.action === 'SELL') {
                // If we are Long, Close Long
                if (existingPosition && existingPosition.side === 'LONG') {
                    next = closePosition(next, existingPosition.id, currentPrice);
                    const closedTrade = next.trades.find(t => !prev.trades.some(pt => pt.id === t.id)); // Find new trade
                    if (closedTrade) persistShadowTrade(closedTrade);
                }

                // If we are Flat, Open Short?
                // For now, let's keep it simple: Long Only or Long/Short?
                // User said "Short" is an option.
                const isFlat = !next.positions.some(p => p.symbol === symbol);
                if (isFlat) {
                    const size = decision.size || 0.5;
                    const q = (next.balance * size * 0.95) / currentPrice;
                    if (q > 0) {
                        next = openPosition(next, {
                            symbol,
                            side: 'SHORT',
                            quantity: q,
                            entryPrice: currentPrice,
                            stopLoss: null,
                            takeProfit: null,
                        });
                    }
                }
            }
            // 3. HOLD Signal
            else {
                // Do nothing
            }

            return next;
        });

    }, [decision, lastClosedCandle, currentPrice, symbol, loaded, persistShadowTrade]); // portfolio dependency removed to avoid loops, using func update

    return { shadowPortfolio: portfolio };
}
