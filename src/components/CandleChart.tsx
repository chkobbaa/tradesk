'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
    createChart,
    IChartApi,
    ISeriesApi,
    CandlestickData,
    ColorType,
    CrosshairMode,
    Time,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    CandlestickSeriesPartialOptions,
} from 'lightweight-charts';
import { Candle } from '@/core/market/types';
import { IndicatorOutput } from '@/core/indicators/types';
import { Position } from '@/core/trading/types';
import styles from './CandleChart.module.css';

interface CandleChartProps {
    candles: Candle[];
    symbol: string;
    height?: number;
    indicators?: IndicatorOutput[];
    positions?: Position[];
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
}

function toCandlestickData(candles: Candle[]): CandlestickData<Time>[] {
    return candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
    }));
}

function toVolumeData(candles: Candle[]) {
    return candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
            c.close >= c.open
                ? 'rgba(0, 210, 106, 0.25)'
                : 'rgba(255, 71, 87, 0.25)',
    }));
}

const CHART_COLORS = {
    background: '#111825',
    text: '#8b949e',
    grid: 'rgba(255, 255, 255, 0.03)',
    crosshair: '#565e6a',
    borderColor: 'rgba(255, 255, 255, 0.06)',
};

const CANDLE_STYLE: CandlestickSeriesPartialOptions = {
    upColor: '#00d26a',
    downColor: '#ff4757',
    borderUpColor: '#00d26a',
    borderDownColor: '#ff4757',
    wickUpColor: '#00d26a',
    wickDownColor: '#ff4757',
};

export default function CandleChart({
    candles,
    symbol,
    height = 500,
    indicators = [],
    positions = [],
    isFullscreen = false,
    onToggleFullscreen,
}: CandleChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
    const macdHistSeriesRef = useRef<Map<string, ISeriesApi<'Histogram'>>>(new Map());
    const priceLinesRef = useRef<Map<string, ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>>>(new Map());

    // Calculate total height including separate panes
    const separateIndicators = indicators.filter(i => i.config.pane === 'separate');
    const paneHeight = separateIndicators.length > 0 ? separateIndicators.length * 120 : 0;
    const chartHeight = isFullscreen ? window.innerHeight - 60 : height;
    const totalHeight = chartHeight + paneHeight;

    const initChart = useCallback(() => {
        if (!chartContainerRef.current) return;

        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
        }
        indicatorSeriesRef.current.clear();
        macdHistSeriesRef.current.clear();
        priceLinesRef.current.clear();

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: totalHeight,
            layout: {
                background: { type: ColorType.Solid, color: CHART_COLORS.background },
                textColor: CHART_COLORS.text,
                fontFamily: "'Inter', -apple-system, sans-serif",
                fontSize: 12,
            },
            grid: {
                vertLines: { color: CHART_COLORS.grid },
                horzLines: { color: CHART_COLORS.grid },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: CHART_COLORS.crosshair,
                    labelBackgroundColor: '#1c2638',
                },
                horzLine: {
                    color: CHART_COLORS.crosshair,
                    labelBackgroundColor: '#1c2638',
                },
            },
            rightPriceScale: {
                borderColor: CHART_COLORS.borderColor,
                scaleMargins: { top: 0.05, bottom: 0.2 },
            },
            timeScale: {
                borderColor: CHART_COLORS.borderColor,
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 5,
                barSpacing: 8,
            },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, CANDLE_STYLE);

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [totalHeight]);

    // Track data identity to detect full reloads vs incremental WebSocket ticks
    const prevCandleLenRef = useRef(0);
    const prevFirstTimeRef = useRef(0);
    const hasInitialData = useRef(false);

    useEffect(() => {
        const cleanup = initChart();
        hasInitialData.current = false;
        prevCandleLenRef.current = 0;
        prevFirstTimeRef.current = 0;
        return () => {
            cleanup?.();
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [initChart]);

    // Main candle data — ONLY fitContent on true dataset changes, NOT on incremental updates
    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
        if (candles.length === 0) return;

        const firstTime = candles[0].time;
        const datasetChanged = firstTime !== prevFirstTimeRef.current;
        const isFirstLoad = !hasInitialData.current;

        // Only do a full setData when the dataset fundamentally changes
        // (different timeframe/symbol = different first candle time)
        if (isFirstLoad || datasetChanged) {
            candleSeriesRef.current.setData(toCandlestickData(candles));
            volumeSeriesRef.current.setData(toVolumeData(candles));
            // Only fitContent on first load or dataset change — NOT on WebSocket appends
            if (chartRef.current) chartRef.current.timeScale().fitContent();
            hasInitialData.current = true;
        } else {
            // Incremental update — just update last candle, preserves zoom/pan
            const last = candles[candles.length - 1];
            candleSeriesRef.current.update({
                time: last.time as Time,
                open: last.open,
                high: last.high,
                low: last.low,
                close: last.close,
            });
            volumeSeriesRef.current.update({
                time: last.time as Time,
                value: last.volume,
                color:
                    last.close >= last.open
                        ? 'rgba(0, 210, 106, 0.25)'
                        : 'rgba(255, 71, 87, 0.25)',
            });
        }

        prevCandleLenRef.current = candles.length;
        prevFirstTimeRef.current = firstTime;
    }, [candles]);

    // ─── Trade Markers (price lines for open positions) ───────────
    useEffect(() => {
        if (!candleSeriesRef.current) return;
        const series = candleSeriesRef.current;

        // Remove old price lines
        for (const [id, line] of priceLinesRef.current.entries()) {
            try { series.removePriceLine(line); } catch { /* noop */ }
        }
        priceLinesRef.current.clear();

        // Add price lines for current positions
        for (const pos of positions) {
            // Entry price line
            const entryLine = series.createPriceLine({
                price: pos.entryPrice,
                color: pos.side === 'LONG' ? '#00d26a' : '#ff4757',
                lineWidth: 1,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: `${pos.side} Entry`,
            });
            priceLinesRef.current.set(`${pos.id}-entry`, entryLine);

            // Stop loss line
            if (pos.stopLoss !== null) {
                const slLine = series.createPriceLine({
                    price: pos.stopLoss,
                    color: '#ff475788',
                    lineWidth: 1,
                    lineStyle: 3, // Dotted
                    axisLabelVisible: true,
                    title: 'SL',
                });
                priceLinesRef.current.set(`${pos.id}-sl`, slLine);
            }

            // Take profit line
            if (pos.takeProfit !== null) {
                const tpLine = series.createPriceLine({
                    price: pos.takeProfit,
                    color: '#00d26a88',
                    lineWidth: 1,
                    lineStyle: 3, // Dotted
                    axisLabelVisible: true,
                    title: 'TP',
                });
                priceLinesRef.current.set(`${pos.id}-tp`, tpLine);
            }
        }
    }, [positions]);

    // Indicator series rendering
    useEffect(() => {
        if (!chartRef.current) return;
        const chart = chartRef.current;

        const activeIds = new Set<string>();
        let paneIndex = 1;

        for (const output of indicators) {
            const { config } = output;
            activeIds.add(config.id);

            if (config.type === 'MACD' && output.macdData) {
                const macdLineId = `${config.id}-line`;
                const signalId = `${config.id}-signal`;
                const histId = `${config.id}-hist`;
                activeIds.add(macdLineId);
                activeIds.add(signalId);
                activeIds.add(histId);

                if (!indicatorSeriesRef.current.has(macdLineId)) {
                    const series = chart.addSeries(LineSeries, {
                        color: config.color, lineWidth: 1,
                    }, paneIndex);
                    indicatorSeriesRef.current.set(macdLineId, series);
                }
                indicatorSeriesRef.current.get(macdLineId)!.setData(
                    output.macdData.map(p => ({ time: p.time as Time, value: p.macd }))
                );

                if (!indicatorSeriesRef.current.has(signalId)) {
                    const series = chart.addSeries(LineSeries, {
                        color: '#ff6b6b', lineWidth: 1,
                    }, paneIndex);
                    indicatorSeriesRef.current.set(signalId, series);
                }
                indicatorSeriesRef.current.get(signalId)!.setData(
                    output.macdData.map(p => ({ time: p.time as Time, value: p.signal }))
                );

                if (!macdHistSeriesRef.current.has(histId)) {
                    const series = chart.addSeries(HistogramSeries, {}, paneIndex);
                    macdHistSeriesRef.current.set(histId, series);
                }
                macdHistSeriesRef.current.get(histId)!.setData(
                    output.macdData.map(p => ({
                        time: p.time as Time,
                        value: p.histogram,
                        color: p.histogram >= 0 ? 'rgba(0, 210, 106, 0.5)' : 'rgba(255, 71, 87, 0.5)',
                    }))
                );
                paneIndex++;
            } else if (config.pane === 'separate') {
                if (!indicatorSeriesRef.current.has(config.id)) {
                    const series = chart.addSeries(LineSeries, {
                        color: config.color, lineWidth: 1,
                    }, paneIndex);
                    indicatorSeriesRef.current.set(config.id, series);
                }
                indicatorSeriesRef.current.get(config.id)!.setData(
                    output.data.map(p => ({ time: p.time as Time, value: p.value }))
                );
                paneIndex++;
            } else {
                if (!indicatorSeriesRef.current.has(config.id)) {
                    const series = chart.addSeries(LineSeries, {
                        color: config.color,
                        lineWidth: 2,
                        lastValueVisible: true,
                        priceLineVisible: false,
                    });
                    indicatorSeriesRef.current.set(config.id, series);
                }
                const series = indicatorSeriesRef.current.get(config.id)!;
                series.applyOptions({ color: config.color });
                series.setData(
                    output.data.map(p => ({ time: p.time as Time, value: p.value }))
                );
            }
        }

        // Cleanup removed indicators
        for (const [id, series] of indicatorSeriesRef.current.entries()) {
            if (!activeIds.has(id)) {
                chart.removeSeries(series);
                indicatorSeriesRef.current.delete(id);
            }
        }
        for (const [id, series] of macdHistSeriesRef.current.entries()) {
            if (!activeIds.has(id)) {
                chart.removeSeries(series);
                macdHistSeriesRef.current.delete(id);
            }
        }
    }, [indicators]);

    return (
        <div className={`${styles.chartCard} ${isFullscreen ? styles.fullscreen : ''}`}>
            <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>
                    <span className={styles.symbolBadge}>{symbol}</span>
                    <span className={styles.chartType}>Candlestick</span>
                    {indicators.length > 0 && (
                        <span className={styles.indicatorCount}>
                            + {indicators.length} indicator{indicators.length > 1 ? 's' : ''}
                        </span>
                    )}
                    {positions.length > 0 && (
                        <span className={styles.positionCount}>
                            {positions.length} open
                        </span>
                    )}
                </div>
                <div className={styles.chartActions}>
                    <button
                        className={styles.actionBtn}
                        onClick={() => chartRef.current?.timeScale().fitContent()}
                        title="Fit all data in view"
                    >
                        ⊞
                    </button>
                    {onToggleFullscreen && (
                        <button
                            className={styles.actionBtn}
                            onClick={onToggleFullscreen}
                            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        >
                            {isFullscreen ? '✕' : '⛶'}
                        </button>
                    )}
                </div>
            </div>
            <div ref={chartContainerRef} className={styles.chartContainer} />
        </div>
    );
}
