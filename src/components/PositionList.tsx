'use client';

import { Position } from '@/core/trading/types';
import { calculateUnrealizedPnL } from '@/core/trading';
import styles from './PositionList.module.css';

interface PositionListProps {
    positions: Position[];
    currentPrice: number;
    onClose: (positionId: string) => void;
}

export default function PositionList({ positions, currentPrice, onClose }: PositionListProps) {
    if (positions.length === 0) {
        return (
            <div className={styles.empty}>
                No open positions
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h4 className={styles.title}>Open Positions</h4>
            <div className={styles.table}>
                <div className={styles.headerRow}>
                    <span>Symbol</span>
                    <span>Side</span>
                    <span>Entry</span>
                    <span>Qty</span>
                    <span>SL / TP</span>
                    <span>PnL</span>
                    <span></span>
                </div>
                {positions.map(pos => {
                    const pnl = calculateUnrealizedPnL(pos, currentPrice);
                    const pnlClass = pnl >= 0 ? styles.pnlPositive : styles.pnlNegative;
                    return (
                        <div key={pos.id} className={styles.row}>
                            <span className={styles.mono}>{pos.symbol}</span>
                            <span className={pos.side === 'LONG' ? styles.long : styles.short}>
                                {pos.side}
                            </span>
                            <span className={styles.mono}>${pos.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            <span className={styles.mono}>{pos.quantity.toFixed(4)}</span>
                            <span className={styles.sltp}>
                                {pos.stopLoss ? `$${pos.stopLoss.toLocaleString()}` : '—'}
                                {' / '}
                                {pos.takeProfit ? `$${pos.takeProfit.toLocaleString()}` : '—'}
                            </span>
                            <span className={`${styles.mono} ${pnlClass}`}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                            </span>
                            <button className={styles.closeBtn} onClick={() => onClose(pos.id)}>
                                Close
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
