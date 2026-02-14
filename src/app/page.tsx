'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Candle, MarketSymbol, Timeframe } from '@/core/market/types';
import CandleTable from '@/components/CandleTable';
import TimeframeSelector from '@/components/TimeframeSelector';
import SymbolSelector from '@/components/SymbolSelector';
import MarketOverview from '@/components/MarketOverview';
import styles from './page.module.css';

export default function Dashboard() {
  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const isFirstLoad = useRef(true);

  // Fetch symbols on mount
  useEffect(() => {
    fetch('/api/symbols')
      .then(res => res.json())
      .then((data: MarketSymbol[]) => {
        if (Array.isArray(data)) setSymbols(data);
      })
      .catch(err => console.error('Failed to fetch symbols:', err));
  }, []);

  // Fetch candles — silent update (no loading flash)
  const fetchCandleData = useCallback(async () => {
    if (isFirstLoad.current) {
      setInitialLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(
        `/api/candles?symbol=${symbol}&timeframe=${timeframe}&limit=100`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch candles');
      }

      setCandles(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInitialLoading(false);
      isFirstLoad.current = false;
    }
  }, [symbol, timeframe]);

  // Reset first load on symbol/timeframe change
  useEffect(() => {
    isFirstLoad.current = true;
    fetchCandleData();
  }, [fetchCandleData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchCandleData, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchCandleData]);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Market Data</h1>
          <p className={styles.subtitle}>
            Live OHLCV candle data · Binance
          </p>
        </div>
        {lastUpdate && (
          <span className={styles.lastUpdate}>
            Last update: {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        )}
      </header>

      {/* Controls */}
      <div className={styles.controls}>
        <div className="control-bar">
          <SymbolSelector symbols={symbols} value={symbol} onChange={setSymbol} />
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
          <button onClick={fetchCandleData}>↻ Refresh</button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'btn-primary' : ''}
          >
            {autoRefresh ? '● Auto' : '○ Auto'}
          </button>
        </div>
      </div>

      {/* Market overview */}
      {candles.length > 0 && (
        <MarketOverview candles={candles} symbol={symbol} />
      )}

      {/* Error state */}
      {error && (
        <div className="error-container">
          <strong>Error:</strong> {error}
          <br />
          <button onClick={fetchCandleData} style={{ marginTop: 8 }}>
            Try Again
          </button>
        </div>
      )}

      {/* Loading state — only on first load */}
      {initialLoading && candles.length === 0 && (
        <div className="loading-container">
          <div className="spinner" />
          Fetching market data...
        </div>
      )}

      {/* Candle table */}
      {candles.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-md)' }}>
          <div className="card-header">
            <h2>
              {symbol} — {timeframe.toUpperCase()} Candles
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {candles.length} candles
            </span>
          </div>
          <CandleTable candles={candles} timeframe={timeframe} />
        </div>
      )}
    </div>
  );
}
