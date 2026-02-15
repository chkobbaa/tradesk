'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    createChart,
    IChartApi,
    HistogramSeries,
    ColorType,
    Time,
} from 'lightweight-charts';
import { Trade } from '@/core/trading/types';
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

interface DailyPnL { day: string; pnl: number; trades: number; wins: number }
interface DistBucket { rangeStart: number; rangeEnd: number; count: number }

type SortKey = 'closeTime' | 'pnl' | 'symbol' | 'side' | 'quantity' | 'duration';
type SortDir = 'asc' | 'desc';

const CHART_OPTIONS = {
    layout: {
        background: { type: ColorType.Solid as const, color: '#111825' },
        textColor: '#8b949e',
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 12,
    },
    grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
    },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
    timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
    },
};

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

export default function TradesPage() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [stats, setStats] = useState<TradeStats | null>(null);
    const [dailyPnL, setDailyPnL] = useState<DailyPnL[]>([]);
    const [distribution, setDistribution] = useState<DistBucket[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterSymbol, setFilterSymbol] = useState('ALL');
    const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');

    // Sort
    const [sortKey, setSortKey] = useState<SortKey>('closeTime');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // Expand
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Chart refs
    const dailyChartRef = useRef<HTMLDivElement>(null);
    const distChartRef = useRef<HTMLDivElement>(null);
    const dailyChart = useRef<IChartApi | null>(null);
    const distChart = useRef<IChartApi | null>(null);

    // Fetch all data
    useEffect(() => {
        Promise.all([
            fetch('/api/trades').then(r => r.json()),
            fetch('/api/trades?view=stats').then(r => r.json()),
            fetch('/api/trades?view=daily').then(r => r.json()),
            fetch('/api/trades?view=distribution').then(r => r.json()),
        ])
            .then(([t, s, d, dist]) => {
                setTrades(Array.isArray(t) ? t : []);
                setStats(s);
                setDailyPnL(Array.isArray(d) ? d : []);
                setDistribution(Array.isArray(dist) ? dist : []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Unique symbols for filter
    const symbols = useMemo(() => {
        const set = new Set(trades.map(t => t.symbol));
        return ['ALL', ...Array.from(set).sort()];
    }, [trades]);

    // Filter + sort trades
    const filteredTrades = useMemo(() => {
        let result = [...trades];
        if (filterSymbol !== 'ALL') result = result.filter(t => t.symbol === filterSymbol);
        if (filterSide !== 'ALL') result = result.filter(t => t.side === filterSide);

        result.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'closeTime': cmp = a.closeTime - b.closeTime; break;
                case 'pnl': cmp = a.pnl - b.pnl; break;
                case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
                case 'side': cmp = a.side.localeCompare(b.side); break;
                case 'quantity': cmp = a.quantity - b.quantity; break;
                case 'duration': cmp = (a.closeTime - a.openTime) - (b.closeTime - b.openTime); break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [trades, filterSymbol, filterSide, sortKey, sortDir]);

    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }, [sortKey]);

    // Daily PnL chart
    useEffect(() => {
        if (!dailyChartRef.current || dailyPnL.length === 0) return;
        if (dailyChart.current) dailyChart.current.remove();

        const chart = createChart(dailyChartRef.current, {
            ...CHART_OPTIONS,
            width: dailyChartRef.current.clientWidth,
            height: 240,
        });

        const series = chart.addSeries(HistogramSeries, {
            lastValueVisible: false,
            priceLineVisible: false,
        });

        series.setData(
            dailyPnL.map(p => ({
                time: p.day as Time,
                value: p.pnl,
                color: p.pnl >= 0 ? 'rgba(0, 210, 106, 0.7)' : 'rgba(255, 71, 87, 0.7)',
            }))
        );

        chart.timeScale().fitContent();
        dailyChart.current = chart;

        const handleResize = () => {
            if (dailyChartRef.current) chart.applyOptions({ width: dailyChartRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);
        return () => { window.removeEventListener('resize', handleResize); chart.remove(); dailyChart.current = null; };
    }, [dailyPnL]);

    // Distribution chart
    useEffect(() => {
        if (!distChartRef.current || distribution.length === 0) return;
        if (distChart.current) distChart.current.remove();

        const chart = createChart(distChartRef.current, {
            ...CHART_OPTIONS,
            width: distChartRef.current.clientWidth,
            height: 240,
        });

        const series = chart.addSeries(HistogramSeries, {
            lastValueVisible: false,
            priceLineVisible: false,
        });

        series.setData(
            distribution.map((b, i) => ({
                time: (i + 1) as unknown as Time,
                value: b.count,
                color: b.rangeStart >= 0 ? 'rgba(0, 210, 106, 0.6)' : 'rgba(255, 71, 87, 0.6)',
            }))
        );

        chart.timeScale().fitContent();
        distChart.current = chart;

        const handleResize = () => {
            if (distChartRef.current) chart.applyOptions({ width: distChartRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);
        return () => { window.removeEventListener('resize', handleResize); chart.remove(); distChart.current = null; };
    }, [distribution]);

    const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
        <th
            onClick={() => handleSort(field)}
            className={sortKey === field ? styles.sortActive : ''}
        >
            {label}
            <span className={styles.sortIcon}>
                {sortKey === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
            </span>
        </th>
    );

    if (loading) {
        return (
            <div className={styles.page}>
                <div className="loading-container">
                    <div className="spinner" />
                    Loading trade data...
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Trade Log</h1>
                    <p className={styles.subtitle}>
                        Complete trade history · All bot & manual trades
                    </p>
                </div>
            </header>

            {/* Summary Cards */}
            {stats && typeof stats.total === 'number' && (
                <div className={styles.cardGrid}>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Total Trades</span>
                        <span className={styles.cardValue}>{stats.total}</span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Win Rate</span>
                        <span className={`${styles.cardValue} ${stats.winRate >= 50 ? styles.green : styles.red}`}>
                            {stats.winRate?.toFixed(1) || '0.0'}%
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Total P&L</span>
                        <span className={`${styles.cardValue} ${stats.totalPnL >= 0 ? styles.green : styles.red}`}>
                            {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL?.toFixed(2) || '0.00'}
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>W / L</span>
                        <span className={styles.cardValue}>
                            <span className={styles.green}>{stats.wins}</span>
                            {' / '}
                            <span className={styles.red}>{stats.losses}</span>
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Best Trade</span>
                        <span className={`${styles.cardValue} ${styles.green}`}>
                            +{stats.bestTrade?.toFixed(2) || '0.00'}
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Worst Trade</span>
                        <span className={`${styles.cardValue} ${styles.red}`}>
                            {stats.worstTrade?.toFixed(2) || '0.00'}
                        </span>
                    </div>
                </div>
            )}

            {/* Charts */}
            <div className={styles.chartsRow}>
                <div className={styles.chartSection}>
                    <h2 className={styles.sectionTitle}>Daily P&L</h2>
                    {dailyPnL.length > 0 ? (
                        <div ref={dailyChartRef} className={styles.chartContainer} />
                    ) : (
                        <div className={styles.emptyChart}>No daily data yet</div>
                    )}
                </div>
                <div className={styles.chartSection}>
                    <h2 className={styles.sectionTitle}>P&L Distribution</h2>
                    {distribution.length > 0 ? (
                        <div ref={distChartRef} className={styles.chartContainer} />
                    ) : (
                        <div className={styles.emptyChart}>No distribution data yet</div>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}>Symbol</span>
                    <select
                        className={styles.filterSelect}
                        value={filterSymbol}
                        onChange={e => setFilterSymbol(e.target.value)}
                    >
                        {symbols.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}>Side</span>
                    <select
                        className={styles.filterSelect}
                        value={filterSide}
                        onChange={e => setFilterSide(e.target.value as 'ALL' | 'LONG' | 'SHORT')}
                    >
                        <option value="ALL">ALL</option>
                        <option value="LONG">LONG</option>
                        <option value="SHORT">SHORT</option>
                    </select>
                </div>
            </div>

            {/* Trade Table */}
            <div className={styles.tableSection}>
                <div className={styles.tableHeader}>
                    <span className={styles.tableTitle}>All Trades</span>
                    <span className={styles.tradeCount}>{filteredTrades.length} trades</span>
                </div>
                {filteredTrades.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>📋 No trades found</p>
                        <p className={styles.emptyHint}>
                            {trades.length === 0
                                ? <>Go to the <a href="/charts">Charts</a> page and start trading.</>
                                : 'Try adjusting your filters.'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <SortHeader label="Date" field="closeTime" />
                                    <SortHeader label="Symbol" field="symbol" />
                                    <SortHeader label="Side" field="side" />
                                    <th>Entry → Exit</th>
                                    <SortHeader label="Qty" field="quantity" />
                                    <SortHeader label="Duration" field="duration" />
                                    <th>Fees</th>
                                    <SortHeader label="P&L" field="pnl" />
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTrades.map(trade => {
                                    const isExpanded = expandedId === trade.id;
                                    const duration = trade.closeTime - trade.openTime;
                                    const pnlPct = trade.entryPrice > 0
                                        ? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100 * (trade.side === 'LONG' ? 1 : -1))
                                        : 0;
                                    return (
                                        <>
                                            <tr
                                                key={trade.id}
                                                className={isExpanded ? styles.expandedRow : ''}
                                                onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                                            >
                                                <td className={styles.mono}>{formatDate(trade.closeTime)}</td>
                                                <td className={styles.mono}>{trade.symbol}</td>
                                                <td className={trade.side === 'LONG' ? styles.long : styles.short}>
                                                    {trade.side}
                                                </td>
                                                <td className={styles.mono}>
                                                    ${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    {' → '}
                                                    ${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className={styles.mono}>{trade.quantity.toFixed(4)}</td>
                                                <td className={styles.mono}>{formatDuration(duration)}</td>
                                                <td className={styles.mono}>${(trade.entryFee + trade.exitFee).toFixed(2)}</td>
                                                <td className={trade.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative}>
                                                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                                                    <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 11 }}>
                                                        ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                                                    </span>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr key={`${trade.id}-detail`} className={styles.detailRow}>
                                                    <td colSpan={8}>
                                                        <div className={styles.detailContent}>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Entry Time</span>
                                                                <span className={styles.detailValue}>
                                                                    {new Date(trade.openTime).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Exit Time</span>
                                                                <span className={styles.detailValue}>
                                                                    {new Date(trade.closeTime).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Duration</span>
                                                                <span className={styles.detailValue}>{formatDuration(duration)}</span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Entry Price</span>
                                                                <span className={styles.detailValue}>${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Exit Price</span>
                                                                <span className={styles.detailValue}>${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Quantity</span>
                                                                <span className={styles.detailValue}>{trade.quantity.toFixed(6)}</span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Stop Loss</span>
                                                                <span className={styles.detailValue}>
                                                                    {trade.stopLoss ? `$${trade.stopLoss.toLocaleString()}` : '—'}
                                                                </span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Take Profit</span>
                                                                <span className={styles.detailValue}>
                                                                    {trade.takeProfit ? `$${trade.takeProfit.toLocaleString()}` : '—'}
                                                                </span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Entry Fee</span>
                                                                <span className={styles.detailValue}>${trade.entryFee.toFixed(4)}</span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Exit Fee</span>
                                                                <span className={styles.detailValue}>${trade.exitFee.toFixed(4)}</span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Net P&L</span>
                                                                <span className={`${styles.detailValue} ${trade.pnl >= 0 ? styles.green : styles.red}`}>
                                                                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(4)}
                                                                </span>
                                                            </div>
                                                            <div className={styles.detailItem}>
                                                                <span className={styles.detailLabel}>Return %</span>
                                                                <span className={`${styles.detailValue} ${pnlPct >= 0 ? styles.green : styles.red}`}>
                                                                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(3)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
