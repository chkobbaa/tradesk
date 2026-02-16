'use client';

import { Trade } from '@/core/trading/types';
import { calculateTradeStats } from '@/core/trading';
import styles from './TradeHistory.module.css';

interface TradeHistoryProps {
    trades: Trade[];
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
    const stats = calculateTradeStats(trades);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h4 className={styles.title}>Trade History</h4>
                {trades.length > 0 && (
                    <div className={styles.stats}>
                        <span className={stats.totalPnL >= 0 ? styles.statGreen : styles.statRed}>
                            PnL: {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
                        </span>
                        <span className={styles.stat}>
                            WR: {stats.winRate.toFixed(0)}%
                        </span>
                        <span className={styles.stat}>
                            {stats.wins}W / {stats.losses}L
                        </span>
                    </div>
                )}
            </div>

            {trades.length === 0 ? (
                <div className={styles.empty}>No trades yet</div>
            ) : (
                <div className={styles.table}>
                    <div className={styles.headerRow}>
                        <span>Symbol</span>
                        <span>Side</span>
                        <span>Entry → Exit</span>
                        <span>Spent</span>
                        <span>Qty</span>
                        <span>Fees</span>
                        <span>PnL</span>
                    </div>
                    {[...trades].reverse().map(trade => (
                        <div key={trade.id} className={styles.row}>
                            <span className={styles.mono}>{trade.symbol}</span>
                            <span className={trade.side === 'LONG' ? styles.long : styles.short}>
                                {trade.side}
                            </span>
                            <span className={styles.mono}>
                                ${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                {' → '}
                                ${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                            <span className={styles.mono}>
                                ${(trade.entryPrice * trade.quantity).toFixed(2)}
                            </span>
                            <span className={styles.mono}>{trade.quantity.toFixed(4)}</span>
                            <span className={styles.fee}>
                                ${(trade.entryFee + trade.exitFee).toFixed(2)}
                            </span>
                            <span className={`${styles.mono} ${trade.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative}`}>
                                {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
