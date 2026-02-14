
import React from 'react';
import { Portfolio } from '@/core/trading/types';
import styles from './ShadowStatus.module.css';

interface ShadowStatusProps {
    portfolio: Portfolio;
}

export const ShadowStatus: React.FC<ShadowStatusProps> = ({ portfolio }) => {
    const startBalance = 10000;
    const totalPnL = portfolio.balance - startBalance;
    const pnlPercent = (totalPnL / startBalance) * 100;

    const position = portfolio.positions[0]; // Assuming single position for now

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <span className={styles.title}>SHADOW MODE (Auto-Trading)</span>
                <span className={styles.badge}>ACTIVE</span>
            </div>

            <div className={styles.row}>
                <div className={styles.stat}>
                    <span className={styles.label}>Balance</span>
                    <span className={styles.value}>${portfolio.balance.toFixed(2)}</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.label}>PnL</span>
                    <span className={`${styles.value} ${totalPnL >= 0 ? styles.win : styles.loss}`}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                    </span>
                </div>
            </div>

            {position ? (
                <div className={styles.positionRow}>
                    <span className={`${styles.posSide} ${position.side === 'LONG' ? styles.long : styles.short}`}>
                        {position.side}
                    </span>
                    <span className={styles.posInfo}>
                        {position.quantity.toFixed(4)} @ {position.entryPrice.toFixed(2)}
                    </span>
                </div>
            ) : (
                <div className={styles.emptyPos}>No Active Position</div>
            )}
        </div>
    );
};
