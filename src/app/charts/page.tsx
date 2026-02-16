'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Candle, MarketSymbol, Timeframe } from '@/core/market/types';
import { DEFAULT_INDICATORS, IndicatorConfig } from '@/core/indicators/types';
import { computeAllIndicators } from '@/core/indicators';
import {
    Portfolio,
    OrderSide,
    INITIAL_BALANCE,
    createPortfolio,
    openPosition,
    closePosition,
    checkStopLossTakeProfit,
} from '@/core/trading';
import CandleChart, { ChartDecision } from '@/components/CandleChart';
import TimeframeSelector from '@/components/TimeframeSelector';
import SymbolSelector from '@/components/SymbolSelector';
import MarketOverview from '@/components/MarketOverview';
import IndicatorPanel from '@/components/IndicatorPanel';
import TradingPanel from '@/components/TradingPanel';
import PositionList from '@/components/PositionList';
import TradeHistory from '@/components/TradeHistory';
import { useBinanceStream } from '@/lib/useBinanceStream';
import { useSignals } from '@/hooks/useSignals';
import { useShadowTrader } from '@/hooks/useShadowTrader';
import { SignalPanel } from '@/components/SignalPanel';
import { ShadowStatus } from '@/components/ShadowStatus';
import { BotRunner } from '@/components/BotRunner';
import styles from './page.module.css';

type ApiDecision = ChartDecision & { symbol: string };

// ─── localStorage Persistence ──────────────────────────────────
const PORTFOLIO_KEY = 'tradesk-portfolio';

// ─── Server-side Persistence ───────────────────────────────────

async function fetchPortfolio(): Promise<Portfolio | null> {
    try {
        const res = await fetch('/api/portfolio');
        if (!res.ok) return null;
        const data = await res.json();
        // server returns { balance, positions }, we need to construct full Portfolio object
        return {
            balance: data.balance,
            positions: data.positions,
            trades: [], // Trades are fetched separately for history if needed, or we can just keep them empty here as PositionList only needs positions
        };
    } catch {
        return null;
    }
}

async function persistPortfolio(p: Portfolio) {
    try {
        await fetch('/api/portfolio', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                balance: p.balance,
                positions: p.positions,
                trades: p.trades,
            }),
        });
    } catch { /* ignore */ }
}

// ════════════════════════════════════════════════════════════════

export default function ChartsPage() {
    const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
    const [symbol, setSymbol] = useState('BTCUSDT');
    const [timeframe, setTimeframe] = useState<Timeframe>('1h');
    const [candles, setCandles] = useState<Candle[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [indicators, setIndicators] = useState<IndicatorConfig[]>(DEFAULT_INDICATORS);
    const [portfolio, setPortfolio] = useState<Portfolio>(createPortfolio);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const isFirstLoad = useRef(true);
    const portfolioLoaded = useRef(false);
    const [lastClosedCandle, setLastClosedCandle] = useState<Candle | null>(null);
    const [decisions, setDecisions] = useState<ChartDecision[]>([]);
    const [showDecisions, setShowDecisions] = useState(false);

    // Load portfolio from server on mount
    useEffect(() => {
        fetchPortfolio().then(serverPortfolio => {
            if (serverPortfolio) {
                // We merge with local trades if needed, but for now let's just use server state
                // Since trades are stored in 'trades' table, we might need to fetch them if we want to show history
                // But TradeHistory component uses portfolio.trades.
                // The /api/portfolio endpoint currently only returns balance and positions.
                // We should probably fetch recent trades from /api/trades to populate history.

                // Let's fetch recent trades too
                fetch('/api/trades?limit=50').then(r => r.json()).then(paramTrades => {
                    setPortfolio({
                        ...serverPortfolio,
                        trades: Array.isArray(paramTrades) ? paramTrades : [],
                    });
                    portfolioLoaded.current = true;
                });
            } else {
                portfolioLoaded.current = true;
            }
        });
    }, []);

    // Save portfolio to server on change (debounced slightly or just direct)
    useEffect(() => {
        if (portfolioLoaded.current) {
            persistPortfolio(portfolio);
        }
    }, [portfolio]);

    // Current price from latest candle
    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

    // Compute indicator outputs
    const indicatorOutputs = useMemo(() => {
        if (candles.length === 0) return [];
        return computeAllIndicators(candles, indicators);
    }, [candles, indicators]);

    // ─── Phase 7: Signals ──────────────────────────────────────
    const { results: signals, decision, macroSentiment, setMacroSentiment } = useSignals(candles);

    // ─── Phase 9: Multi-Asset Bot Runners ──────────────────────
    // specific symbols we want the bot to trade
    const activeSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    // We still need one "main" shadow portfolio for the UI status component
    // We can just fetch it from API or let the individual runners handle updates
    // For now, let's keep the hook ONLY for the CURRENT symbol to show status
    // But the actual trading logic for ALL symbols happens in the runners below.
    // We use the global 'portfolio' state for the UI, which is updated by the BotRunners.
    // The BotRunners encapsulate the trading logic for each active symbol.
    // We don't need to call useShadowTrader here directly anymore.

    // Let's rely on the API synchronization. 
    // We will render BotRunners for all symbols.
    // AND we will use a "readonly" version of useShadowTrader or just fetch portfolio for UI.
    // For simplicity in this step: We will use BotRunners for ALL modifications.
    // And we will use a simplified hook just to READ portfolio for the UI.
    // Wait, useShadowTrader does both.
    // Let's modify ChartsPage to ONLY use BotRunners for logic.
    // And use a new useShadowPortfolio hook for UI.
    // For now, I will comment out the old single-asset logic to prevent conflicts
    // and let BotRunners handle everything.
    // But we need 'shadowPortfolio' variable for the JSX below.
    // Let's mock it or fetch it.
    // Actually, let's keep the hook but DISABLE its trading logic if it's handled by runner?
    // No, cleaner to just have BotRunners.
    // I will add a simple useEffect to fetch portfolio for UI display.

    // ───────────────────────────────────────────────────────────

    // Fetch symbols
    useEffect(() => {
        fetch('/api/symbols')
            .then(res => res.json())
            .then((data: MarketSymbol[]) => {
                if (Array.isArray(data)) setSymbols(data);
            })
            .catch(err => console.error('Failed to fetch symbols:', err));
    }, []);

    // Fetch shadow decisions for visualization
    useEffect(() => {
        if (!showDecisions) return;
        fetch('/api/shadow/decisions?limit=500')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const filtered = (data as ApiDecision[]).filter(d => d.symbol === symbol);
                    setDecisions(filtered);
                }
            })
            .catch(err => console.error('Failed to fetch decisions:', err));
    }, [showDecisions, symbol]);

    // Fetch candle history
    const fetchCandleData = useCallback(async () => {
        if (isFirstLoad.current) setInitialLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}&limit=200`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch candles');
            setCandles(data);
            setLastUpdate(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setInitialLoading(false);
            isFirstLoad.current = false;
        }
    }, [symbol, timeframe]);

    useEffect(() => {
        isFirstLoad.current = true;
        fetchCandleData();
    }, [fetchCandleData]);

    // WebSocket real-time updates
    const handleStreamUpdate = useCallback((candle: Candle, isClosed: boolean) => {
        setCandles(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx].time === candle.time) {
                updated[lastIdx] = candle;
            } else if (isClosed || candle.time > updated[lastIdx].time) {
                updated.push(candle);
                if (updated.length > 200) updated.shift();
            }
            return updated;
        });
        if (isClosed) {
            setLastClosedCandle(candle);
        }
        setLastUpdate(new Date());
    }, []);

    useBinanceStream({
        symbol,
        timeframe,
        onUpdate: handleStreamUpdate,
        enabled: candles.length > 0,
    });

    // Check SL/TP on every price update
    useEffect(() => {
        if (currentPrice <= 0 || portfolio.positions.length === 0) return;
        const symbolPositions = portfolio.positions.filter(p => p.symbol === symbol);
        if (symbolPositions.length === 0) return;

        const { portfolio: updated, triggered } = checkStopLossTakeProfit(portfolio, currentPrice);
        if (triggered.length > 0) {
            setPortfolio(updated);
            // Persist each triggered trade
            for (const trade of triggered) {
                persistTrade(trade);
            }
        }
    }, [currentPrice, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist a closed trade to the database
    const persistTrade = useCallback((trade: import('@/core/trading/types').Trade) => {
        const snapshot = indicators
            .filter(i => i.enabled)
            .map(i => ({ type: i.type, params: i.params }));
        fetch('/api/trades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade, indicatorSnapshot: snapshot }),
        }).catch(() => { /* silent */ });
    }, [indicators]);

    // ─── Trading Actions ───────────────────────────────────────
    const handlePlaceOrder = useCallback((order: {
        side: OrderSide;
        quantity: number;
        stopLoss: number | null;
        takeProfit: number | null;
    }) => {
        setPortfolio(prev =>
            openPosition(prev, {
                symbol,
                side: order.side,
                quantity: order.quantity,
                entryPrice: currentPrice,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
            })
        );
    }, [symbol, currentPrice]);

    const handleClosePosition = useCallback((positionId: string) => {
        setPortfolio(prev => {
            const updated = closePosition(prev, positionId, currentPrice);
            // Find the newly added trade (last in updated.trades that isn't in prev.trades)
            const newTrade = updated.trades.find(
                t => !prev.trades.some(pt => pt.id === t.id)
            );
            if (newTrade) persistTrade(newTrade);
            return updated;
        });
    }, [currentPrice, persistTrade]);

    const handleReset = useCallback(() => {
        setPortfolio(createPortfolio(INITIAL_BALANCE));
    }, []);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Charts & Trading</h1>
                    <p className={styles.subtitle}>
                        Real-time charts · Paper Trading Simulator
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span className="badge badge-bull" style={{ fontSize: 11 }}>● LIVE</span>
                    {lastUpdate && (
                        <span className={styles.lastUpdate}>
                            {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
                        </span>
                    )}
                </div>
            </header>

            {/* Controls */}
            <div className={styles.controls}>
                <div className="control-bar">
                    <SymbolSelector symbols={symbols} value={symbol} onChange={setSymbol} />
                    <TimeframeSelector value={timeframe} onChange={setTimeframe} />
                    <button onClick={fetchCandleData}>↻ Refresh</button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none', marginLeft: 12 }}>
                        <input
                            type="checkbox"
                            checked={showDecisions}
                            onChange={e => setShowDecisions(e.target.checked)}
                        />
                        Show Bot Decisions
                    </label>
                </div>
            </div>

            {/* Indicator toggles */}
            <IndicatorPanel indicators={indicators} onChange={setIndicators} />

            {/* Market overview */}
            {candles.length > 0 && (
                <MarketOverview candles={candles} symbol={symbol} />
            )}

            {/* Error */}
            {error && (
                <div className="error-container">
                    <strong>Error:</strong> {error}
                    <br />
                    <button onClick={fetchCandleData} style={{ marginTop: 8 }}>Try Again</button>
                </div>
            )}

            {/* Loading */}
            {initialLoading && candles.length === 0 && (
                <div className="loading-container">
                    <div className="spinner" />
                    Fetching chart data...
                </div>
            )}

            {/* Chart + Trading Panel side by side */}
            {candles.length > 0 && (
                <div className={`${styles.chartTradingRow} ${isFullscreen ? styles.fullscreenRow : ''}`}>
                    <div className={styles.chartCol}>
                        <CandleChart
                            candles={candles}
                            symbol={symbol}
                            height={500}
                            indicators={indicatorOutputs}
                            positions={portfolio.positions.filter(p => p.symbol === symbol)}
                            isFullscreen={isFullscreen}
                            onToggleFullscreen={() => setIsFullscreen(f => !f)}
                            decisions={showDecisions ? decisions : []}
                        />
                        <div style={{ marginTop: '1rem' }}>
                            <SignalPanel
                                signals={signals}
                                decision={decision}
                                macroSentiment={macroSentiment}
                                onMacroChange={setMacroSentiment}
                            />
                        </div>
                    </div>
                    {!isFullscreen && (
                        <div className={styles.tradingCol}>
                            <ShadowStatus portfolio={portfolio} />
                            <TradingPanel
                                portfolio={portfolio}
                                currentPrice={currentPrice}
                                symbol={symbol}
                                onPlaceOrder={handlePlaceOrder}
                                onReset={handleReset}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Positions & History */}
            {candles.length > 0 && (
                <div className={styles.bottomSection}>
                    <PositionList
                        positions={portfolio.positions.filter(p => p.symbol === symbol)}
                        currentPrice={currentPrice}
                        onClose={handleClosePosition}
                    />
                    <TradeHistory trades={portfolio.trades} />
                </div>
            )}

            {/* ─── Multi-Asset Bot Runners ─── */}
            {activeSymbols.map(sym => (
                <BotRunner
                    key={sym}
                    symbol={sym}
                    isActive={true}
                    portfolio={portfolio}
                    onUpdatePortfolio={setPortfolio}
                />
            ))}
        </div>
    );
}
