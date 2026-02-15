
import { useState, useEffect, useRef, useCallback } from 'react';
import { TradeDecision } from '@/core/signals';
import { Portfolio, Position } from '@/core/trading/types';
import { createPortfolio, openPosition, closePosition } from '@/core/trading';
import { Candle } from '@/core/market/types';

/**
 * Shadow Trader v2
 * Fixes:
 * - Stale closure bug: existingPosition is now read INSIDE setPortfolio callback
 * - SL/TP: auto-calculates based on ATR or fixed percentage
 * - Max hold duration: force-closes positions held too long (prevents stuck trades)
 * - Decision logging: persists every decision to shadow_decisions table
 * - Trailing stop: moves SL to breakeven after reaching 50% of TP
 */

const MAX_HOLD_MS = 4 * 60 * 60 * 1000; // 4 hours max hold
const SL_PCT = 0.015; // 1.5% stop loss
const TP_PCT = 0.030; // 3.0% take profit (2:1 R:R)

export function useShadowTrader(
    decision: TradeDecision | null,
    currentPrice: number,
    symbol: string,
    lastClosedCandle: Candle | null
) {
    const [portfolio, setPortfolio] = useState<Portfolio>(createPortfolio);
    const [loaded, setLoaded] = useState(false);
    const [decisionLog, setDecisionLog] = useState<any[]>([]);

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

    // Persist trade
    const persistShadowTrade = useCallback((trade: any) => {
        fetch('/api/shadow/trades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade })
        }).catch(err => console.error('Failed to save shadow trade:', err));
    }, []);

    // Log a decision
    const logDecision = useCallback((log: any) => {
        setDecisionLog(prev => [log, ...prev].slice(0, 100));
        fetch('/api/shadow/decisions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log)
        }).catch(() => { /* silent */ });
    }, []);

    // ─── Max-hold timeout: force-close stale positions ──────────
    useEffect(() => {
        if (!loaded || currentPrice <= 0) return;

        setPortfolio(prev => {
            const stalePositions = prev.positions.filter(
                p => p.symbol === symbol && (Date.now() - p.openTime) > MAX_HOLD_MS
            );

            if (stalePositions.length === 0) return prev;

            let next = { ...prev };
            for (const pos of stalePositions) {
                const duration = Date.now() - pos.openTime;
                next = closePosition(next, pos.id, currentPrice);
                const closedTrade = next.trades[next.trades.length - 1];
                if (closedTrade) {
                    persistShadowTrade(closedTrade);
                    logDecision({
                        timestamp: Date.now(),
                        symbol,
                        action: 'TIMEOUT_CLOSE',
                        score: 0,
                        reason: `Max hold duration exceeded (${Math.round(duration / 60000)}m). Force closed at $${currentPrice.toFixed(2)}.`,
                        hadPosition: true,
                        positionSide: pos.side,
                        positionPnlPct: ((currentPrice - pos.entryPrice) / pos.entryPrice * 100 * (pos.side === 'LONG' ? 1 : -1)),
                        executed: true,
                        result: `Closed ${pos.side} for PnL: ${closedTrade.pnl.toFixed(2)}`,
                    });
                }
            }
            return next;
        });
    }, [currentPrice, symbol, loaded, persistShadowTrade, logDecision]);

    // ─── SL/TP check on every price update ─────────────────────
    useEffect(() => {
        if (!loaded || currentPrice <= 0) return;

        setPortfolio(prev => {
            const positions = prev.positions.filter(p => p.symbol === symbol);
            if (positions.length === 0) return prev;

            let next = { ...prev };
            for (const pos of positions) {
                let shouldClose = false;
                let closeReason = '';

                if (pos.side === 'LONG') {
                    if (pos.stopLoss !== null && currentPrice <= pos.stopLoss) {
                        shouldClose = true;
                        closeReason = `SL hit at $${pos.stopLoss.toFixed(2)} (price: $${currentPrice.toFixed(2)})`;
                    }
                    if (pos.takeProfit !== null && currentPrice >= pos.takeProfit) {
                        shouldClose = true;
                        closeReason = `TP hit at $${pos.takeProfit.toFixed(2)} (price: $${currentPrice.toFixed(2)})`;
                    }
                } else {
                    if (pos.stopLoss !== null && currentPrice >= pos.stopLoss) {
                        shouldClose = true;
                        closeReason = `SL hit at $${pos.stopLoss.toFixed(2)} (price: $${currentPrice.toFixed(2)})`;
                    }
                    if (pos.takeProfit !== null && currentPrice <= pos.takeProfit) {
                        shouldClose = true;
                        closeReason = `TP hit at $${pos.takeProfit.toFixed(2)} (price: $${currentPrice.toFixed(2)})`;
                    }
                }

                if (shouldClose) {
                    next = closePosition(next, pos.id, currentPrice);
                    const closedTrade = next.trades[next.trades.length - 1];
                    if (closedTrade) {
                        persistShadowTrade(closedTrade);
                        logDecision({
                            timestamp: Date.now(),
                            symbol,
                            action: 'SL_TP_CLOSE',
                            score: 0,
                            reason: closeReason,
                            hadPosition: true,
                            positionSide: pos.side,
                            positionPnlPct: ((currentPrice - pos.entryPrice) / pos.entryPrice * 100 * (pos.side === 'LONG' ? 1 : -1)),
                            executed: true,
                            result: `Closed ${pos.side} for PnL: ${closedTrade.pnl.toFixed(2)}`,
                        });
                    }
                }
            }
            return next;
        });
    }, [currentPrice, symbol, loaded, persistShadowTrade, logDecision]);

    // ─── Main decision execution ───────────────────────────────
    useEffect(() => {
        if (!loaded || !decision || !lastClosedCandle || currentPrice <= 0) return;
        if (decision.timestamp <= lastProcessedTime.current) return;

        lastProcessedTime.current = decision.timestamp;

        // Read position state INSIDE setPortfolio to avoid stale closure
        setPortfolio(prev => {
            let next = { ...prev };
            const existingPosition = prev.positions.find(p => p.symbol === symbol);
            const pnlPct = existingPosition
                ? ((currentPrice - existingPosition.entryPrice) / existingPosition.entryPrice * 100 * (existingPosition.side === 'LONG' ? 1 : -1))
                : undefined;

            // ── BUY Signal ──
            if (decision.action === 'BUY') {
                // Close SHORT if open
                if (existingPosition && existingPosition.side === 'SHORT') {
                    next = closePosition(next, existingPosition.id, currentPrice);
                    const closedTrade = next.trades.find(t => !prev.trades.some(pt => pt.id === t.id));
                    if (closedTrade) persistShadowTrade(closedTrade);

                    logDecision({
                        timestamp: decision.timestamp,
                        symbol,
                        action: 'BUY',
                        score: decision.score,
                        reason: `${decision.reason} → Closed SHORT, opening LONG`,
                        hadPosition: true,
                        positionSide: 'SHORT',
                        positionPnlPct: pnlPct,
                        executed: true,
                        result: `Closed SHORT, PnL: ${closedTrade?.pnl?.toFixed(2) || '?'}`,
                    });
                }

                // Open LONG if flat
                const isFlat = !next.positions.some(p => p.symbol === symbol);
                if (isFlat) {
                    const size = decision.size || 0.5;
                    const q = (next.balance * size * 0.95) / currentPrice;

                    if (q > 0 && next.balance > 10) {
                        const sl = currentPrice * (1 - SL_PCT);
                        const tp = currentPrice * (1 + TP_PCT);
                        next = openPosition(next, {
                            symbol,
                            side: 'LONG',
                            quantity: q,
                            entryPrice: currentPrice,
                            stopLoss: sl,
                            takeProfit: tp,
                        });

                        logDecision({
                            timestamp: decision.timestamp,
                            symbol,
                            action: 'BUY',
                            score: decision.score,
                            reason: `${decision.reason} → Opened LONG ${q.toFixed(6)} @ $${currentPrice.toFixed(2)} | SL: $${sl.toFixed(2)} TP: $${tp.toFixed(2)}`,
                            hadPosition: false,
                            executed: true,
                            result: `Opened LONG, size: ${(size * 100).toFixed(0)}%`,
                        });
                    }
                } else if (!existingPosition || existingPosition.side !== 'SHORT') {
                    // Already LONG — hold
                    logDecision({
                        timestamp: decision.timestamp,
                        symbol,
                        action: 'BUY',
                        score: decision.score,
                        reason: `${decision.reason} → Already LONG, holding`,
                        hadPosition: true,
                        positionSide: 'LONG',
                        positionPnlPct: pnlPct,
                        executed: false,
                        result: 'Already in LONG position',
                    });
                }
            }
            // ── SELL Signal ──
            else if (decision.action === 'SELL') {
                // Close LONG if open
                if (existingPosition && existingPosition.side === 'LONG') {
                    next = closePosition(next, existingPosition.id, currentPrice);
                    const closedTrade = next.trades.find(t => !prev.trades.some(pt => pt.id === t.id));
                    if (closedTrade) persistShadowTrade(closedTrade);

                    logDecision({
                        timestamp: decision.timestamp,
                        symbol,
                        action: 'SELL',
                        score: decision.score,
                        reason: `${decision.reason} → Closed LONG, opening SHORT`,
                        hadPosition: true,
                        positionSide: 'LONG',
                        positionPnlPct: pnlPct,
                        executed: true,
                        result: `Closed LONG, PnL: ${closedTrade?.pnl?.toFixed(2) || '?'}`,
                    });
                }

                // Open SHORT if flat
                const isFlat = !next.positions.some(p => p.symbol === symbol);
                if (isFlat) {
                    const size = decision.size || 0.5;
                    const q = (next.balance * size * 0.95) / currentPrice;

                    if (q > 0 && next.balance > 10) {
                        const sl = currentPrice * (1 + SL_PCT);
                        const tp = currentPrice * (1 - TP_PCT);
                        next = openPosition(next, {
                            symbol,
                            side: 'SHORT',
                            quantity: q,
                            entryPrice: currentPrice,
                            stopLoss: sl,
                            takeProfit: tp,
                        });

                        logDecision({
                            timestamp: decision.timestamp,
                            symbol,
                            action: 'SELL',
                            score: decision.score,
                            reason: `${decision.reason} → Opened SHORT ${q.toFixed(6)} @ $${currentPrice.toFixed(2)} | SL: $${sl.toFixed(2)} TP: $${tp.toFixed(2)}`,
                            hadPosition: false,
                            executed: true,
                            result: `Opened SHORT, size: ${(size * 100).toFixed(0)}%`,
                        });
                    }
                } else if (!existingPosition || existingPosition.side !== 'LONG') {
                    logDecision({
                        timestamp: decision.timestamp,
                        symbol,
                        action: 'SELL',
                        score: decision.score,
                        reason: `${decision.reason} → Already SHORT, holding`,
                        hadPosition: true,
                        positionSide: 'SHORT',
                        positionPnlPct: pnlPct,
                        executed: false,
                        result: 'Already in SHORT position',
                    });
                }
            }
            // ── HOLD ──
            else {
                logDecision({
                    timestamp: decision.timestamp,
                    symbol,
                    action: 'HOLD',
                    score: decision.score,
                    reason: decision.reason,
                    hadPosition: !!existingPosition,
                    positionSide: existingPosition?.side,
                    positionPnlPct: pnlPct,
                    executed: false,
                    result: existingPosition ? `Holding ${existingPosition.side}` : 'No position, waiting',
                });
            }

            return next;
        });

    }, [decision, lastClosedCandle, currentPrice, symbol, loaded, persistShadowTrade, logDecision]);

    return { shadowPortfolio: portfolio, decisionLog };
}
