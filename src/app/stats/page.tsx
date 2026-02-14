'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    createChart,
    IChartApi,
    LineSeries,
    HistogramSeries,
    ColorType,
    Time,
} from 'lightweight-charts';
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

interface EquityPoint { time: number; balance: number }
interface DrawdownPoint { time: number; drawdown: number; maxDrawdown: number }
interface SymbolRow { symbol: string; trades: number; wins: number; total_pnl: number; avg_pnl: number }

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

export default function StatsPage() {
    const [stats, setStats] = useState<TradeStats | null>(null);
    const [equity, setEquity] = useState<EquityPoint[]>([]);
    const [drawdown, setDrawdown] = useState<DrawdownPoint[]>([]);
    const [symbolStats, setSymbolStats] = useState<SymbolRow[]>([]);
    const [loading, setLoading] = useState(true);

    const equityChartRef = useRef<HTMLDivElement>(null);
    const drawdownChartRef = useRef<HTMLDivElement>(null);
    const equityChart = useRef<IChartApi | null>(null);
    const drawdownChart = useRef<IChartApi | null>(null);

    // Fetch all data
    useEffect(() => {
        Promise.all([
            fetch('/api/trades?view=stats').then(r => r.json()),
            fetch('/api/trades?view=equity').then(r => r.json()),
            fetch('/api/trades?view=drawdown').then(r => r.json()),
            fetch('/api/trades?view=symbols').then(r => r.json()),
        ])
            .then(([st, eq, dd, sym]) => {
                setStats(st);
                setEquity(eq);
                setDrawdown(dd);
                setSymbolStats(sym);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Render equity curve chart
    useEffect(() => {
        if (!equityChartRef.current || equity.length === 0) return;

        if (equityChart.current) equityChart.current.remove();

        const chart = createChart(equityChartRef.current, {
            ...CHART_OPTIONS,
            width: equityChartRef.current.clientWidth,
            height: 280,
        });

        const series = chart.addSeries(LineSeries, {
            color: '#00d26a',
            lineWidth: 2,
            lastValueVisible: true,
            priceLineVisible: false,
        });

        series.setData(
            equity.map(p => ({
                time: Math.floor(p.time / 1000) as Time,
                value: p.balance,
            }))
        );

        chart.timeScale().fitContent();
        equityChart.current = chart;

        const handleResize = () => {
            if (equityChartRef.current) {
                chart.applyOptions({ width: equityChartRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            equityChart.current = null;
        };
    }, [equity]);

    // Render drawdown chart
    useEffect(() => {
        if (!drawdownChartRef.current || drawdown.length === 0) return;

        if (drawdownChart.current) drawdownChart.current.remove();

        const chart = createChart(drawdownChartRef.current, {
            ...CHART_OPTIONS,
            width: drawdownChartRef.current.clientWidth,
            height: 200,
        });

        const series = chart.addSeries(HistogramSeries, {
            color: 'rgba(255, 71, 87, 0.6)',
        });

        series.setData(
            drawdown.map(p => ({
                time: Math.floor(p.time / 1000) as Time,
                value: -p.drawdown,
            }))
        );

        chart.timeScale().fitContent();
        drawdownChart.current = chart;

        const handleResize = () => {
            if (drawdownChartRef.current) {
                chart.applyOptions({ width: drawdownChartRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            drawdownChart.current = null;
        };
    }, [drawdown]);

    const maxDD = drawdown.length > 0
        ? drawdown[drawdown.length - 1].maxDrawdown
        : 0;

    if (loading) {
        return (
            <div className={styles.page}>
                <div className="loading-container">
                    <div className="spinner" />
                    Loading trade statistics...
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Performance Statistics</h1>
                    <p className={styles.subtitle}>
                        Trading performance overview & analytics
                    </p>
                </div>
            </header>

            {/* Summary Cards */}
            {stats && (
                <div className={styles.cardGrid}>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Total Trades</span>
                        <span className={styles.cardValue}>{stats.total}</span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Win Rate</span>
                        <span className={`${styles.cardValue} ${stats.winRate >= 50 ? styles.green : styles.red}`}>
                            {stats.winRate.toFixed(1)}%
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Total P&L</span>
                        <span className={`${styles.cardValue} ${stats.totalPnL >= 0 ? styles.green : styles.red}`}>
                            {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Max Drawdown</span>
                        <span className={`${styles.cardValue} ${styles.red}`}>
                            -{maxDD.toFixed(1)}%
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
                        <span className={styles.cardLabel}>Avg Win / Loss</span>
                        <span className={styles.cardValue}>
                            <span className={styles.green}>+{stats.avgWin.toFixed(2)}</span>
                            {' / '}
                            <span className={styles.red}>{stats.avgLoss.toFixed(2)}</span>
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Best Trade</span>
                        <span className={`${styles.cardValue} ${styles.green}`}>
                            +{stats.bestTrade.toFixed(2)}
                        </span>
                    </div>
                    <div className={styles.card}>
                        <span className={styles.cardLabel}>Worst Trade</span>
                        <span className={`${styles.cardValue} ${styles.red}`}>
                            {stats.worstTrade.toFixed(2)}
                        </span>
                    </div>
                </div>
            )}

            {/* Equity Curve */}
            <div className={styles.chartSection}>
                <h2 className={styles.sectionTitle}>Equity Curve</h2>
                {equity.length > 0 ? (
                    <div ref={equityChartRef} className={styles.chartContainer} />
                ) : (
                    <div className={styles.emptyChart}>
                        No trades yet — start trading to see your equity curve
                    </div>
                )}
            </div>

            {/* Drawdown */}
            <div className={styles.chartSection}>
                <h2 className={styles.sectionTitle}>Drawdown</h2>
                {drawdown.length > 0 ? (
                    <div ref={drawdownChartRef} className={styles.chartContainer} />
                ) : (
                    <div className={styles.emptyChart}>
                        No drawdown data yet
                    </div>
                )}
            </div>

            {/* Per-Symbol Breakdown */}
            {symbolStats.length > 0 && (
                <div className={styles.chartSection}>
                    <h2 className={styles.sectionTitle}>Per-Symbol Breakdown</h2>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Trades</th>
                                <th>Wins</th>
                                <th>Win Rate</th>
                                <th>Total P&L</th>
                                <th>Avg P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {symbolStats.map(s => (
                                <tr key={s.symbol}>
                                    <td className={styles.mono}>{s.symbol}</td>
                                    <td>{s.trades}</td>
                                    <td>{s.wins}</td>
                                    <td>{s.trades > 0 ? ((s.wins / s.trades) * 100).toFixed(1) : 0}%</td>
                                    <td className={s.total_pnl >= 0 ? styles.green : styles.red}>
                                        {s.total_pnl >= 0 ? '+' : ''}{s.total_pnl.toFixed(2)}
                                    </td>
                                    <td className={s.avg_pnl >= 0 ? styles.green : styles.red}>
                                        {s.avg_pnl >= 0 ? '+' : ''}{s.avg_pnl.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty state */}
            {stats && stats.total === 0 && (
                <div className={styles.emptyState}>
                    <p>📊 No trades recorded yet</p>
                    <p className={styles.emptyHint}>
                        Go to the <a href="/charts">Charts</a> page and start trading to see your stats here.
                    </p>
                </div>
            )}
        </div>
    );
}
