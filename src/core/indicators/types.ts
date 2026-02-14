/**
 * Indicator Engine — Core Types
 */

import { Candle } from '@/core/market/types';

/** Single indicator data point */
export interface IndicatorPoint {
    time: number;
    value: number;
}

/** MACD has three output series */
export interface MACDPoint {
    time: number;
    macd: number;
    signal: number;
    histogram: number;
}

/** Available indicator types */
export type IndicatorType = 'SMA' | 'EMA' | 'RSI' | 'MACD';

/** Where the indicator renders */
export type IndicatorPane = 'overlay' | 'separate';

/** Configuration for a single indicator instance */
export interface IndicatorConfig {
    id: string;             // Unique key, e.g. "sma-20"
    type: IndicatorType;
    enabled: boolean;
    color: string;
    params: Record<string, number>;
    pane: IndicatorPane;
}

/** Indicator output — computed from candles + config */
export interface IndicatorOutput {
    config: IndicatorConfig;
    data: IndicatorPoint[];
    macdData?: MACDPoint[];  // Only for MACD
}

// ─── Default Presets ───────────────────────────────────────────

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
    {
        id: 'sma-20',
        type: 'SMA',
        enabled: false,
        color: '#f5a623',
        params: { period: 20 },
        pane: 'overlay',
    },
    {
        id: 'ema-50',
        type: 'EMA',
        enabled: false,
        color: '#7b61ff',
        params: { period: 50 },
        pane: 'overlay',
    },
    {
        id: 'rsi-14',
        type: 'RSI',
        enabled: false,
        color: '#00bcd4',
        params: { period: 14 },
        pane: 'separate',
    },
    {
        id: 'macd-12-26-9',
        type: 'MACD',
        enabled: false,
        color: '#4caf50',
        params: { fast: 12, slow: 26, signal: 9 },
        pane: 'separate',
    },
];
