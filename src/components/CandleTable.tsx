'use client';

import { Candle } from '@/core/market/types';
import { formatPrice, formatVolume, formatTime, percentChange, formatPercent } from '@/lib/utils';
import styles from './CandleTable.module.css';

interface CandleTableProps {
    candles: Candle[];
    timeframe: string;
}

export default function CandleTable({ candles, timeframe }: CandleTableProps) {
    if (candles.length === 0) {
        return (
            <div className="loading-container">
                No candle data available.
            </div>
        );
    }

    // Display newest first
    const sorted = [...candles].reverse();

    return (
        <div className={styles.tableWrap}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Open</th>
                        <th>High</th>
                        <th>Low</th>
                        <th>Close</th>
                        <th>Change</th>
                        <th>Volume</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((candle) => {
                        const isBull = candle.close >= candle.open;
                        const change = percentChange(candle.open, candle.close);

                        return (
                            <tr
                                key={candle.time}
                                className={isBull ? 'row-bull' : 'row-bear'}
                            >
                                <td>{formatTime(candle.time, timeframe)}</td>
                                <td>{formatPrice(candle.open)}</td>
                                <td>{formatPrice(candle.high)}</td>
                                <td>{formatPrice(candle.low)}</td>
                                <td className={isBull ? 'bull' : 'bear'}>
                                    {formatPrice(candle.close)}
                                </td>
                                <td className={isBull ? 'bull' : 'bear'}>
                                    {formatPercent(change)}
                                </td>
                                <td>{formatVolume(candle.volume)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
