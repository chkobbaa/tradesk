'use client';

import { Candle } from '@/core/market/types';
import { formatPrice, formatPercent, percentChange, formatVolume } from '@/lib/utils';
import styles from './MarketOverview.module.css';

interface MarketOverviewProps {
    candles: Candle[];
    symbol: string;
}

export default function MarketOverview({ candles, symbol }: MarketOverviewProps) {
    if (candles.length === 0) return null;

    const latest = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : latest;
    const change = percentChange(prev.close, latest.close);
    const isBull = latest.close >= prev.close;

    // 24h high/low from available data
    const high24 = Math.max(...candles.map(c => c.high));
    const low24 = Math.min(...candles.map(c => c.low));
    const totalVol = candles.reduce((sum, c) => sum + c.volume, 0);

    return (
        <div className={styles.overview}>
            <div className={styles.priceBlock}>
                <div className={styles.symbolLabel}>{symbol.replace('USDT', ' / USDT')}</div>
                <div className={`${styles.price} ${isBull ? styles.bull : styles.bear}`}>
                    {formatPrice(latest.close)}
                </div>
                <span className={`badge ${isBull ? 'badge-bull' : 'badge-bear'}`}>
                    {formatPercent(change)}
                </span>
            </div>

            <div className={styles.stats}>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>High</span>
                    <span className={styles.statValue}>{formatPrice(high24)}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Low</span>
                    <span className={styles.statValue}>{formatPrice(low24)}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Volume</span>
                    <span className={styles.statValue}>{formatVolume(totalVol)}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Open</span>
                    <span className={styles.statValue}>{formatPrice(latest.open)}</span>
                </div>
            </div>
        </div>
    );
}
