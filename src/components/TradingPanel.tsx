'use client';

import { useState } from 'react';
import { OrderSide, Portfolio } from '@/core/trading/types';
import styles from './TradingPanel.module.css';

interface TradingPanelProps {
    portfolio: Portfolio;
    currentPrice: number;
    symbol: string;
    onPlaceOrder: (order: {
        side: OrderSide;
        quantity: number;
        stopLoss: number | null;
        takeProfit: number | null;
    }) => void;
    onReset: () => void;
}

export default function TradingPanel({
    portfolio,
    currentPrice,
    symbol,
    onPlaceOrder,
    onReset,
}: TradingPanelProps) {
    const [side, setSide] = useState<OrderSide>('LONG');
    const [quantity, setQuantity] = useState('0.01');
    const [useSL, setUseSL] = useState(false);
    const [useTP, setUseTP] = useState(false);
    const [slPrice, setSlPrice] = useState('');
    const [tpPrice, setTpPrice] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const cost = parseFloat(quantity || '0') * currentPrice;
    const fee = 0; // Fees disabled
    const total = cost + fee;

    const handleSubmit = () => {
        setError(null);
        setSuccess(null);
        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            setError('Invalid quantity');
            return;
        }

        const sl = useSL ? parseFloat(slPrice) : null;
        const tp = useTP ? parseFloat(tpPrice) : null;

        if (sl !== null && isNaN(sl)) { setError('Invalid stop loss price'); return; }
        if (tp !== null && isNaN(tp)) { setError('Invalid take profit price'); return; }

        if (side === 'LONG') {
            if (sl !== null && sl >= currentPrice) { setError('SL must be below entry for LONG'); return; }
            if (tp !== null && tp <= currentPrice) { setError('TP must be above entry for LONG'); return; }
        } else {
            if (sl !== null && sl <= currentPrice) { setError('SL must be above entry for SHORT'); return; }
            if (tp !== null && tp >= currentPrice) { setError('TP must be below entry for SHORT'); return; }
        }

        try {
            onPlaceOrder({ side, quantity: qty, stopLoss: sl, takeProfit: tp });
            setSuccess(`${side} ${qty.toFixed(4)} ${symbol.replace('USDT', '')} @ $${currentPrice.toLocaleString()}`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Order failed');
        }
    };

    // Quick quantity presets — accounts for 0.1% fee so 100% actually works
    const setQuickQty = (pct: number) => {
        const maxCost = portfolio.balance * pct;
        // Deduct fee: cost + cost*0.001 = maxCost => cost = maxCost / 1.001
        const adjustedCost = maxCost / 1.001;
        const qty = adjustedCost / currentPrice;
        setQuantity(qty.toFixed(6));
    };

    // Quick SL/TP by percentage from current price
    const setSLByPct = (pct: number) => {
        if (side === 'LONG') {
            setSlPrice((currentPrice * (1 - pct / 100)).toFixed(2));
        } else {
            setSlPrice((currentPrice * (1 + pct / 100)).toFixed(2));
        }
        setUseSL(true);
    };

    const setTPByPct = (pct: number) => {
        if (side === 'LONG') {
            setTpPrice((currentPrice * (1 + pct / 100)).toFixed(2));
        } else {
            setTpPrice((currentPrice * (1 - pct / 100)).toFixed(2));
        }
        setUseTP(true);
    };

    const pnlIfTP = useTP && tpPrice ? (() => {
        const tp = parseFloat(tpPrice);
        const qty = parseFloat(quantity || '0');
        if (isNaN(tp) || isNaN(qty)) return null;
        const raw = side === 'LONG' ? (tp - currentPrice) * qty : (currentPrice - tp) * qty;
        return raw - (qty * currentPrice * 0.001) - (qty * tp * 0.001);
    })() : null;

    const pnlIfSL = useSL && slPrice ? (() => {
        const sl = parseFloat(slPrice);
        const qty = parseFloat(quantity || '0');
        if (isNaN(sl) || isNaN(qty)) return null;
        const raw = side === 'LONG' ? (sl - currentPrice) * qty : (currentPrice - sl) * qty;
        return raw - (qty * currentPrice * 0.001) - (qty * sl * 0.001);
    })() : null;

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <h3 className={styles.title}>Trade</h3>
                <button className={styles.resetBtn} onClick={onReset} title="Reset portfolio to $10,000">
                    Reset
                </button>
            </div>

            {/* Balance */}
            <div className={styles.balanceRow}>
                <span className={styles.balanceLabel}>Balance</span>
                <span className={styles.balanceValue}>${portfolio.balance.toFixed(2)}</span>
            </div>

            {/* Side Toggle */}
            <div className={styles.sideToggle}>
                <button
                    className={`${styles.sideBtn} ${side === 'LONG' ? styles.longActive : ''}`}
                    onClick={() => setSide('LONG')}
                >
                    Long
                </button>
                <button
                    className={`${styles.sideBtn} ${side === 'SHORT' ? styles.shortActive : ''}`}
                    onClick={() => setSide('SHORT')}
                >
                    Short
                </button>
            </div>

            {/* Entry Info */}
            <div className={styles.infoRow}>
                <span>Entry</span>
                <span className={styles.mono}>
                    ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>

            {/* Quantity */}
            <label className={styles.fieldLabel}>
                Qty ({symbol.replace('USDT', '')})
                <input
                    type="number"
                    className={styles.input}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    step="0.001"
                    min="0"
                />
            </label>

            <div className={styles.quickBtns}>
                <button onClick={() => setQuickQty(0.1)}>10%</button>
                <button onClick={() => setQuickQty(0.25)}>25%</button>
                <button onClick={() => setQuickQty(0.5)}>50%</button>
                <button onClick={() => setQuickQty(1)}>MAX</button>
            </div>

            {/* Cost breakdown */}
            <div className={styles.costSection}>
                <div className={styles.infoRow}>
                    <span>Cost</span>
                    <span className={styles.mono}>${cost.toFixed(2)}</span>
                </div>
                <div className={styles.infoRow}>
                    <span>Fee (0.1%)</span>
                    <span className={styles.mono}>${fee.toFixed(2)}</span>
                </div>
                <div className={`${styles.infoRow} ${styles.totalRow}`}>
                    <span>Total</span>
                    <span className={`${styles.mono} ${total > portfolio.balance ? styles.overBudget : ''}`}>
                        ${total.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Stop Loss */}
            <div className={styles.sltp}>
                <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} />
                    Stop Loss
                </label>
                {useSL && (
                    <>
                        <input
                            type="number"
                            className={styles.input}
                            value={slPrice}
                            onChange={e => setSlPrice(e.target.value)}
                            placeholder={side === 'LONG' ? 'Below entry' : 'Above entry'}
                            step="0.01"
                        />
                        <div className={styles.pctBtns}>
                            <button onClick={() => setSLByPct(1)}>1%</button>
                            <button onClick={() => setSLByPct(2)}>2%</button>
                            <button onClick={() => setSLByPct(5)}>5%</button>
                            <button onClick={() => setSLByPct(10)}>10%</button>
                        </div>
                        {pnlIfSL !== null && (
                            <span className={`${styles.pnlPreview} ${pnlIfSL >= 0 ? styles.pnlGreen : styles.pnlRed}`}>
                                Risk: {pnlIfSL >= 0 ? '+' : ''}{pnlIfSL.toFixed(2)}
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Take Profit */}
            <div className={styles.sltp}>
                <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={useTP} onChange={e => setUseTP(e.target.checked)} />
                    Take Profit
                </label>
                {useTP && (
                    <>
                        <input
                            type="number"
                            className={styles.input}
                            value={tpPrice}
                            onChange={e => setTpPrice(e.target.value)}
                            placeholder={side === 'LONG' ? 'Above entry' : 'Below entry'}
                            step="0.01"
                        />
                        <div className={styles.pctBtns}>
                            <button onClick={() => setTPByPct(1)}>1%</button>
                            <button onClick={() => setTPByPct(2)}>2%</button>
                            <button onClick={() => setTPByPct(5)}>5%</button>
                            <button onClick={() => setTPByPct(10)}>10%</button>
                        </div>
                        {pnlIfTP !== null && (
                            <span className={`${styles.pnlPreview} ${pnlIfTP >= 0 ? styles.pnlGreen : styles.pnlRed}`}>
                                Target: {pnlIfTP >= 0 ? '+' : ''}{pnlIfTP.toFixed(2)}
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Risk/Reward ratio */}
            {pnlIfSL !== null && pnlIfTP !== null && pnlIfSL !== 0 && (
                <div className={styles.rrRow}>
                    <span>R/R Ratio</span>
                    <span className={styles.mono}>
                        1 : {Math.abs(pnlIfTP / pnlIfSL).toFixed(1)}
                    </span>
                </div>
            )}

            {/* Success message */}
            {success && <div className={styles.success}>{success}</div>}

            {/* Error */}
            {error && <div className={styles.error}>{error}</div>}

            {/* Submit */}
            <button
                className={`${styles.submitBtn} ${side === 'LONG' ? styles.submitLong : styles.submitShort}`}
                onClick={handleSubmit}
                disabled={total > portfolio.balance}
            >
                {side === 'LONG' ? '▲ Open Long' : '▼ Open Short'}
            </button>
        </div>
    );
}
