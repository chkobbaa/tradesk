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

interface ShadowData {
    stats: TradeStats;
    equity: { time: number; balance: number }[];
    recentTrades: Trade[];
    portfolio: { balance: number; positions: Position[] };
}

function formatSmallDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function MobilePage() {
    const [data, setData] = useState<ShadowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchData = useCallback(async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await fetch('/api/shadow/stats');
            if (!res.ok) throw new Error('Failed');
            const json = await res.json();
            setData(json);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Mobile fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial + auto-refresh
    useEffect(() => {
        fetchData();
        intervalRef.current = setInterval(() => fetchData(), 30_000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchData]);

    if (loading) {
        return (
            <div className={styles.mobileApp}>
                <div className={styles.loadingScreen}>
                    <div className="spinner" />
                    Loading bot data...
                </div>
            </div>
        );
    }

    const stats = data?.stats;
    const portfolio = data?.portfolio;
    const recentTrades = data?.recentTrades || [];
    const position = portfolio?.positions?.[0] || null;
    const startBalance = 10000;
    const balance = portfolio?.balance ?? startBalance;
    const totalPnL = balance - startBalance;
    const pnlPct = (totalPnL / startBalance) * 100;

    return (
        <div className={styles.mobileApp}>
            {/* Header */}
            <header className={styles.mobileHeader}>
                <div className={styles.headerLeft}>
                    <div className={styles.logoDot} />
                    <span className={styles.logoText}>TraDesk</span>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.liveDot} />
                    {lastUpdate && (
                        <span className={styles.lastUpdate}>
                            {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
                        </span>
                    )}
                    <button
                        className={styles.refreshBtn}
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                    >
                        <span className={refreshing ? styles.refreshSpin : ''}>↻</span>
                    </button>
                </div>
            </header>

            <div className={styles.content}>
                {/* Balance Card */}
                <div className={styles.statusCard}>
                    <div className={styles.statusHeader}>
                        <span className={styles.botLabel}>Shadow Bot</span>
                        <span className={`${styles.badge} ${position ? styles.badgeActive : styles.badgeIdle}`}>
                            {position ? '● IN TRADE' : '○ IDLE'}
                        </span>
                    </div>

                    <div className={styles.balanceSection}>
                        <div className={styles.balanceLabel}>Balance</div>
                        <div className={styles.balanceValue}>
                            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={styles.pnlRow}>
                            <span className={`${styles.pnlValue} ${totalPnL >= 0 ? styles.green : styles.red}`}>
                                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                            </span>
                            <span className={`${styles.pnlPct} ${totalPnL >= 0 ? styles.green : styles.red}`}>
                                ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                            </span>
                        </div>
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

                {/* Current Position */}
                <div className={styles.positionCard}>
                    <div className={styles.positionHeader}>
                        <span className={styles.positionTitle}>Current Position</span>
                    </div>
                    {position ? (
                        <div className={styles.positionBody}>
                            <span className={`${styles.posSide} ${position.side === 'LONG' ? styles.posLong : styles.posShort}`}>
                                {position.side}
                            </span>
                            <div className={styles.posInfo}>
                                <span className={styles.posQty}>
                                    {position.quantity.toFixed(4)} {position.symbol.replace('USDT', '')}
                                </span>
                                <span className={styles.posEntry}>
                                    Entry: ${position.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.emptyPosition}>No active position</div>
                    )}
                </div>

                {/* Recent Trades */}
                <div className={styles.tradesSection}>
                    <div className={styles.tradesHeader}>
                        <span className={styles.tradesTitle}>Recent Trades</span>
                        <span className={styles.tradesCount}>{recentTrades.length}</span>
                    </div>
                    {recentTrades.length === 0 ? (
                        <div className={styles.emptyTrades}>No trades yet</div>
                    ) : (
                        <ul className={styles.tradesList}>
                            {recentTrades.slice(0, 10).map(trade => (
                                <li key={trade.id} className={styles.tradeItem}>
                                    <div className={styles.tradeLeft}>
                                        <span className={styles.tradeSymbol}>{trade.symbol}</span>
                                        <span className={styles.tradeMeta}>
                                            <span className={`${styles.tradeSide} ${trade.side === 'LONG' ? styles.green : styles.red}`}>
                                                {trade.side}
                                            </span>
                                            <span>{trade.quantity.toFixed(4)}</span>
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
                    )}
                </div>
            </div>

            <div className={styles.footer}>
                <a href="/" className={styles.footerLink}>Open full dashboard →</a>
            </div>
        </div>
    );
}
