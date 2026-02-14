/**
 * Binance WebSocket kline stream hook.
 * Connects to wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>
 * and pushes real-time candle updates every ~2 seconds.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Candle, Timeframe } from '@/core/market/types';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
};

interface BinanceKlineEvent {
    e: string;       // Event type
    E: number;       // Event time
    s: string;       // Symbol
    k: {
        t: number;     // Kline start time (ms)
        T: number;     // Kline close time (ms)
        s: string;     // Symbol
        i: string;     // Interval
        o: string;     // Open price
        c: string;     // Close price
        h: string;     // High price
        l: string;     // Low price
        v: string;     // Base asset volume
        x: boolean;    // Is this kline closed?
    };
}

function parseKlineEvent(event: BinanceKlineEvent): Candle {
    const k = event.k;
    return {
        time: Math.floor(k.t / 1000), // ms → seconds
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
    };
}

interface UseBinanceStreamOptions {
    symbol: string;
    timeframe: Timeframe;
    onUpdate: (candle: Candle, isClosed: boolean) => void;
    enabled?: boolean;
}

/**
 * Hook that connects to Binance kline WebSocket stream.
 * Calls onUpdate with the latest candle data every ~2 seconds.
 * `isClosed` is true when a candle has closed (new candle starting).
 */
export function useBinanceStream({
    symbol,
    timeframe,
    onUpdate,
    enabled = true,
}: UseBinanceStreamOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const onUpdateRef = useRef(onUpdate);

    // Keep the callback ref up to date without re-connecting
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    const connect = useCallback(() => {
        if (!enabled) return;

        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const stream = `${symbol.toLowerCase()}@kline_${TIMEFRAME_MAP[timeframe]}`;
        const url = `${BINANCE_WS}/${stream}`;

        const ws = new WebSocket(url);

        ws.onmessage = (event) => {
            try {
                const data: BinanceKlineEvent = JSON.parse(event.data);
                const candle = parseKlineEvent(data);
                onUpdateRef.current(candle, data.k.x);
            } catch {
                // Ignore parse errors
            }
        };

        ws.onerror = () => {
            // Will auto-reconnect via onclose
        };

        ws.onclose = () => {
            // Reconnect after 3 seconds
            if (enabled) {
                setTimeout(() => {
                    connect();
                }, 3000);
            }
        };

        wsRef.current = ws;
    }, [symbol, timeframe, enabled]);

    // Connect/reconnect on symbol or timeframe change
    useEffect(() => {
        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);
}
