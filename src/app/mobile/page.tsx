'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Trade, Position } from '@/core/trading/types';
import styles from './page.module.css';

interface TradeStats {
    total: number;
    wins: number;
    losses: number;
    totalPnL: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
}

interface Decision {
    id: number;
    timestamp: number;
    symbol: string;
    action: string;
    score: number;
    reason: string;
    hadPosition: boolean;
    positionSide?: string;
    positionPnlPct?: number;
    executed: boolean;
    result?: string;
}

interface RegimeData {
    label: string;
    reason: string;
    confidence: number;
}

interface ShadowData {
    stats: TradeStats;
    equity: { time: number; balance: number }[];
    recentTrades: Trade[];
    portfolio: { balance: number; positions: Position[] };
    decisions: Decision[];
    regime?: RegimeData;
    currentPrice?: number;
    prices?: Record<string, number>;
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function formatSmallDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function regimeEmoji(label: string): string {
    switch (label) {
        case 'TRENDING': return '📈';
        case 'RANGING': return '↔️';
        case 'HIGH_VOLATILITY': return '⚡';
        case 'EVENT_DRIVEN': return '🚨';
        case 'UNCLEAR': return '🌫️';
        default: return '❓';
    }
}

function regimeStyle(label: string): string {
    switch (label) {
        case 'TRENDING': return styles.regimeTrending;
        case 'RANGING': return styles.regimeRanging;
        case 'HIGH_VOLATILITY': return styles.regimeHighVol;
        case 'EVENT_DRIVEN': return styles.regimeEvent;
        default: return styles.regimeUnclear;
    }
}

function actionIcon(action: string): string {
    switch (action) {
        case 'BUY': return '🟢';
        case 'SELL': return '🔴';
        case 'HOLD': return '⏸️';
        case 'SL_TP_CLOSE': return '🎯';
        case 'TIMEOUT_CLOSE': return '⏰';
        default: return '•';
    }
}

function actionColor(action: string): string {
    switch (action) {
        case 'BUY': return styles.green;
        case 'SELL': return styles.red;
        case 'HOLD': return styles.muted;
        case 'SL_TP_CLOSE': return styles.yellow;
        case 'TIMEOUT_CLOSE': return styles.yellow;
        default: return '';
    }
}

type Tab = 'overview' | 'thoughts' | 'trades';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function MobilePage() {
    const [tab, setTab] = useState<Tab>('overview');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [isAdvancedMode, setIsAdvancedMode] = useState(false);

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.register('/sw.js').then(reg => {
                reg.pushManager.getSubscription().then(sub => {
                    setIsSubscribed(!!sub);
                });
            });
        }
    }, []);
    // ... existing togglePush code ...

    // ... inside component render ...


    async function togglePush() {
        if (!('serviceWorker' in navigator)) return;

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (sub) {
            // Unsubscribe
            await sub.unsubscribe();
            await fetch('/api/notifications/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            setIsSubscribed(false);
        } else {
            // Subscribe
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidKey) return alert('VAPID key missing');

            const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidKey,
            });

            await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: newSub }),
            });
            setIsSubscribed(true);
        }
    }

    // Selection Handlers
    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleCloseSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Close ${selectedIds.size} position(s) at current market price?`)) return;

        try {
            const res = await fetch('/api/shadow/trade/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positionIds: Array.from(selectedIds) }),
            });
            const json = await res.json();
            if (json.success) {
                setIsSelectionMode(false);
                setSelectedIds(new Set());
                mutate(); // Refresh data
            } else {
                alert('Error closing positions: ' + json.error);
            }
        } catch (err) {
            alert('Failed to close positions');
        }
    };

    const { data, isLoading, mutate } = useSWR<ShadowData>('/api/shadow/stats', fetcher, {
        refreshInterval: 10000,
    });

    const refresh = async () => {
        setIsRefreshing(true);
        await mutate();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    if (isLoading && !data) return (
        <div className={styles.loadingScreen}>
            <div className={styles.logoDot} />
            <span>Loading Shadow Bot...</span>
        </div>
    );

    const stats = data?.stats;
    const portfolio = data?.portfolio;
    const recentTrades = data?.recentTrades || [];
    const decisions = data?.decisions || [];
    const regime = data?.regime;
    const positions = portfolio?.positions || [];
    const prices = data?.prices || {};
    const btcPrice = data?.currentPrice || 0;

    const startBalance = 10000;
    const balance = portfolio?.balance ?? startBalance;

    // Calculate Unrealized PnL
    const unrealizedPnL = positions.reduce((sum, pos) => {
        const price = prices[pos.symbol] || (pos.symbol === 'BTCUSDT' ? btcPrice : pos.entryPrice);
        const pnl = (price - pos.entryPrice) * pos.quantity * (pos.side === 'LONG' ? 1 : -1);
        return sum + pnl;
    }, 0);

    const totalPnL = (balance + unrealizedPnL) - startBalance;
    const pnlPct = (totalPnL / startBalance) * 100;

    return (
        <main className={styles.mobileApp}>
            {/* ─── Header ─── */}
            <header className={styles.mobileHeader}>
                <div className={styles.headerLeft}>
                    <div className={styles.logoDot} />
                    <span className={styles.logoText}>Shadow Bot</span>
                </div>
                <div className={styles.headerRight}>
                    <button
                        className={`${styles.iconBtn} ${isSubscribed ? styles.iconActive : ''}`}
                        onClick={togglePush}
                        aria-label="Toggle notifications"
                    >
                        {isSubscribed ? '🔔' : '🔕'}
                    </button>
                    <div className={styles.liveDot} />
                    <button
                        className={`${styles.refreshBtn} ${isRefreshing ? styles.refreshSpin : ''}`}
                        onClick={refresh}
                    >
                        ↻
                    </button>
                </div>
            </header>

            {/* Tab Bar */}
            <div className={styles.tabBar}>
                <button
                    className={`${styles.tabBtn} ${tab === 'overview' ? styles.tabActive : ''}`}
                    onClick={() => setTab('overview')}
                >
                    📊 Overview
                </button>
                <button
                    className={`${styles.tabBtn} ${tab === 'thoughts' ? styles.tabActive : ''}`}
                    onClick={() => setTab('thoughts')}
                >
                    🧠 Thoughts
                    {decisions.filter(d => d.executed).length > 0 && (
                        <span className={styles.tabBadge}>{decisions.filter(d => d.executed).length}</span>
                    )}
                </button>
                <button
                    className={`${styles.tabBtn} ${tab === 'trades' ? styles.tabActive : ''}`}
                    onClick={() => setTab('trades')}
                >
                    📈 Trades
                </button>
            </div>

            <div className={styles.content}>
                {/* ── Overview Tab ── */}
                {tab === 'overview' && (
                    <>
                        {/* Regime Label */}
                        {regime && (
                            <div className={`${styles.regimeBadge} ${regimeStyle(regime.label)}`}>
                                <span className={styles.regimeIcon}>{regimeEmoji(regime.label)}</span>
                                <div className={styles.regimeInfo}>
                                    <span className={styles.regimeLabel}>{regime.label.replace('_', ' ')}</span>
                                    <span className={styles.regimeReason}>{regime.reason}</span>
                                </div>
                            </div>
                        )}

                        {/* Balance Card */}
                        <div className={styles.statusCard}>
                            <div className={styles.statusHeader}>
                                <span className={styles.botLabel}>Shadow Bot</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label className={styles.modeToggle}>
                                        <span onClick={() => setIsAdvancedMode(false)} className={!isAdvancedMode ? styles.activeMode : ''}>Simple</span>
                                        <span onClick={() => setIsAdvancedMode(true)} className={isAdvancedMode ? styles.activeMode : ''}>Adv</span>
                                    </label>
                                    <span className={`${styles.badge} ${positions.length > 0 ? styles.badgeActive : styles.badgeIdle}`}>
                                        {positions.length > 0 ? `● ${positions.length}` : '○'}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.balanceSection}>
                                <div className={styles.balanceLabel}>Net Worth (Equity)</div>
                                <div className={styles.balanceValue}>
                                    ${(balance + unrealizedPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className={styles.pnlRow}>
                                    <span className={styles.pnlLabel}>Unrealized PnL:</span>
                                    <span className={`${styles.pnlValue} ${unrealizedPnL >= 0 ? styles.green : styles.red}`}>
                                        {unrealizedPnL >= 0 ? '+' : ''}${Math.abs(unrealizedPnL).toFixed(2)}
                                    </span>
                                </div>
                                {isAdvancedMode && (
                                    <div className={styles.advancedStats}>
                                        <div className={styles.statRow}>
                                            <span>Cash Balance:</span>
                                            <span>${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className={styles.statRow}>
                                            <span>Total Return:</span>
                                            <span className={(balance + unrealizedPnL - startBalance) >= 0 ? styles.green : styles.red}>
                                                {((balance + unrealizedPnL - startBalance) / startBalance * 100).toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Stats */}
                        {stats && (
                            <div className={styles.statGrid}>
                                <div className={styles.statCard}>
                                    <span className={styles.statLabel}>Total Trades</span>
                                    <span className={styles.statValue}>{stats.total}</span>
                                </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statLabel}>Win Rate</span>
                                    <span className={`${styles.statValue} ${stats.winRate >= 50 ? styles.green : styles.red}`}>
                                        {stats.winRate.toFixed(1)}%
                                    </span>
                                </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statLabel}>Best Trade</span>
                                    <span className={`${styles.statValue} ${styles.green}`}>
                                        +{stats.bestTrade.toFixed(2)}
                                    </span>
                                </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statLabel}>Worst Trade</span>
                                    <span className={`${styles.statValue} ${styles.red}`}>
                                        {stats.worstTrade.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Active Positions List */}
                        <div className={styles.positionSection}>
                            <div className={styles.positionHeader}>
                                <span className={styles.positionTitle}>Active Positions ({positions.length})</span>
                                {positions.length > 0 && (
                                    <button
                                        className={styles.selectBtn}
                                        onClick={() => {
                                            if (isSelectionMode) {
                                                setIsSelectionMode(false);
                                                setSelectedIds(new Set());
                                            } else {
                                                setIsSelectionMode(true);
                                            }
                                        }}
                                    >
                                        {isSelectionMode ? 'Cancel' : 'Select'}
                                    </button>
                                )}
                            </div>

                            {positions.length === 0 ? (
                                <div className={styles.emptyPosition}>No active positions</div>
                            ) : (
                                <ul className={styles.positionList}>
                                    {positions.map(pos => {
                                        const currentPrice = prices[pos.symbol] || (pos.symbol === 'BTCUSDT' ? btcPrice : 0);
                                        return (
                                            <li
                                                key={pos.id}
                                                className={`${styles.positionCard} ${isSelectionMode ? styles.selectionMode : ''} ${selectedIds.has(pos.id) ? styles.selected : ''}`}
                                                onClick={() => isSelectionMode && toggleSelection(pos.id)}
                                            >
                                                {isSelectionMode && (
                                                    <div className={`${styles.paramCheckbox} ${selectedIds.has(pos.id) ? styles.checked : ''}`}>
                                                        {selectedIds.has(pos.id) && '✓'}
                                                    </div>
                                                )}
                                                <div className={styles.positionBody}>
                                                    <div className={styles.posRow}>
                                                        <span className={`${styles.posSide} ${pos.side === 'LONG' ? styles.posLong : styles.posShort}`}>
                                                            {pos.side}
                                                        </span>
                                                        <span className={styles.posSymbol}>{pos.symbol}</span>
                                                    </div>
                                                    <div className={styles.posDetails}>
                                                        <div className={styles.posDetail}>
                                                            <span className={styles.posDetailLabel}>Entry</span>
                                                            <span>${pos.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className={styles.posDetail}>
                                                            <span className={styles.posDetailLabel}>Qty</span>
                                                            <span>{pos.quantity.toFixed(6)}</span>
                                                        </div>
                                                        {pos.stopLoss && (
                                                            <div className={styles.posDetail}>
                                                                <span className={styles.posDetailLabel}>SL</span>
                                                                <span className={styles.red}>${pos.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                        {pos.takeProfit && (
                                                            <div className={styles.posDetail}>
                                                                <span className={styles.posDetailLabel}>TP</span>
                                                                <span className={styles.green}>${pos.takeProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                        <div className={styles.posDetail}>
                                                            <span className={styles.posDetailLabel}>Held</span>
                                                            <span>{timeAgo(pos.openTime)}</span>
                                                        </div>
                                                        {currentPrice > 0 && (
                                                            <div className={styles.posDetail} style={{ width: '100%', marginTop: 4, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4 }}>
                                                                <span className={styles.posDetailLabel}>Live P&L</span>
                                                                <span className={((currentPrice - pos.entryPrice) * (pos.side === 'LONG' ? 1 : -1)) >= 0 ? styles.green : styles.red}>
                                                                    {((currentPrice - pos.entryPrice) * pos.quantity * (pos.side === 'LONG' ? 1 : -1) >= 0 ? '+' : '')}
                                                                    ${((currentPrice - pos.entryPrice) * pos.quantity * (pos.side === 'LONG' ? 1 : -1)).toFixed(2)}
                                                                    {' ('}
                                                                    {((currentPrice - pos.entryPrice) / pos.entryPrice * 100 * (pos.side === 'LONG' ? 1 : -1) >= 0 ? '+' : '')}
                                                                    {((currentPrice - pos.entryPrice) / pos.entryPrice * 100 * (pos.side === 'LONG' ? 1 : -1)).toFixed(2)}%)
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {/* Floating Action Button for Closing */}
                        {isSelectionMode && selectedIds.size > 0 && (
                            <div className={styles.floatingAction}>
                                <button className={styles.floatingCloseBtn} onClick={handleCloseSelected}>
                                    Close {selectedIds.size} Position{selectedIds.size > 1 ? 's' : ''} 🗑️
                                </button>
                            </div>
                        )}

                        {/* Last Decision */}
                        {decisions.length > 0 && (
                            <div className={styles.lastDecisionCard}>
                                <div className={styles.lastDecisionHeader}>
                                    <span>Last Decision</span>
                                    <span className={styles.lastDecisionTime}>{timeAgo(decisions[0].timestamp)}</span>
                                </div>
                                <div className={styles.lastDecisionBody}>
                                    <span className={actionColor(decisions[0].action)}>
                                        {actionIcon(decisions[0].action)} {decisions[0].action}
                                    </span>
                                    <span className={styles.lastDecisionScore}>
                                        Score: {decisions[0].score.toFixed(3)}
                                    </span>
                                </div>
                                <div className={styles.lastDecisionReason}>
                                    {decisions[0].reason}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── Thoughts Tab ── */}
                {tab === 'thoughts' && (
                    <div className={styles.thoughtsSection}>
                        <div className={styles.thoughtsHeader}>
                            <span className={styles.thoughtsTitle}>🧠 Bot Decision Log</span>
                            <span className={styles.thoughtsCount}>{decisions.length} recent</span>
                        </div>
                        {decisions.length === 0 ? (
                            <div className={styles.emptyTrades}>No decisions logged yet. The bot needs candle data from the Charts page to make decisions.</div>
                        ) : (
                            <ul className={styles.thoughtsList}>
                                {decisions.map((d: Decision, i: number) => (
                                    <li key={d.id || i} className={`${styles.thoughtItem} ${d.executed ? styles.thoughtExecuted : ''}`}>
                                        <div className={styles.thoughtTop}>
                                            <span className={`${styles.thoughtAction} ${actionColor(d.action)}`}>
                                                {actionIcon(d.action)} {d.action}
                                            </span>
                                            <span className={styles.thoughtTime}>{timeAgo(d.timestamp)}</span>
                                        </div>
                                        <div className={styles.thoughtScore}>
                                            <div className={styles.scoreBar}>
                                                <div
                                                    className={`${styles.scoreFill} ${d.score > 0 ? styles.scorePositive : d.score < 0 ? styles.scoreNegative : ''}`}
                                                    style={{
                                                        width: `${Math.min(Math.abs(d.score) * 100, 100)}%`,
                                                        marginLeft: d.score < 0 ? 'auto' : undefined,
                                                    }}
                                                />
                                            </div>
                                            <span className={styles.scoreLabel}>{d.score.toFixed(3)}</span>
                                        </div>
                                        <div className={styles.thoughtReason}>{d.reason}</div>
                                        {d.result && (
                                            <div className={`${styles.thoughtResult} ${d.executed ? styles.green : styles.muted}`}>
                                                → {d.result}
                                            </div>
                                        )}
                                        {d.hadPosition && d.positionPnlPct !== undefined && (
                                            <div className={styles.thoughtPnl}>
                                                Position P&L: <span className={d.positionPnlPct >= 0 ? styles.green : styles.red}>
                                                    {d.positionPnlPct >= 0 ? '+' : ''}{d.positionPnlPct.toFixed(2)}%
                                                </span>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* ── Trades Tab ── */}
                {tab === 'trades' && (
                    <div className={styles.tradesSection}>
                        <div className={styles.tradesHeader}>
                            <span className={styles.tradesTitle}>Trade History</span>
                            <span className={styles.tradesCount}>{recentTrades.length}</span>
                        </div>
                        {recentTrades.length === 0 ? (
                            <div className={styles.emptyTrades}>No trades yet</div>
                        ) : (
                            <div className={styles.tradesContainer}>
                                <div className={styles.tradesTableHeader} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', padding: '8px 12px', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <span>Result</span>
                                    <span style={{ textAlign: 'center' }}>Details</span>
                                    <span style={{ textAlign: 'right' }}>PnL</span>
                                </div>
                                <ul className={styles.tradesList}>
                                    {recentTrades.map((trade: Trade) => (
                                        <li key={trade.id} className={styles.tradeItem}>
                                            <div className={styles.tradeLeft}>
                                                <span className={styles.tradeSymbol}>{trade.symbol}</span>
                                                <span className={styles.tradeMeta}>
                                                    <span className={`${styles.tradeSide} ${trade.side === 'LONG' ? styles.green : styles.red}`}>
                                                        {trade.side}
                                                    </span>
                                                    <span>{trade.quantity.toFixed(4)}</span>
                                                </span>
                                                <span className={styles.tradeEntryExit}>
                                                    ${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    {' → '}
                                                    ${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div className={styles.tradeRight}>
                                                <div className={`${styles.tradePnl} ${trade.pnl >= 0 ? styles.green : styles.red}`}>
                                                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                                                </div>
                                                <div className={styles.tradeDate}>
                                                    {formatSmallDate(trade.closeTime)}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={styles.footer}>
                <a href="/" className={styles.footerLink}>Open full dashboard →</a>
            </div>
        </main>
    );
}
