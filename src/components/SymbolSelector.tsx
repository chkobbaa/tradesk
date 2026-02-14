'use client';

import { MarketSymbol } from '@/core/market/types';
import styles from './SymbolSelector.module.css';

interface SymbolSelectorProps {
    symbols: MarketSymbol[];
    value: string;
    onChange: (symbol: string) => void;
}

export default function SymbolSelector({ symbols, value, onChange }: SymbolSelectorProps) {
    return (
        <div className={styles.wrapper}>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={styles.select}
            >
                {symbols.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                        {s.baseAsset} / {s.quoteAsset}
                    </option>
                ))}
            </select>
            <span className={styles.chevron}>▾</span>
        </div>
    );
}
