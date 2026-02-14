'use client';

import { IndicatorConfig } from '@/core/indicators/types';
import styles from './IndicatorPanel.module.css';

interface IndicatorPanelProps {
    indicators: IndicatorConfig[];
    onChange: (updated: IndicatorConfig[]) => void;
}

const TYPE_LABELS: Record<string, string> = {
    SMA: 'SMA',
    EMA: 'EMA',
    RSI: 'RSI',
    MACD: 'MACD',
};

function mainParam(ind: IndicatorConfig): { key: string; value: number } | null {
    if (ind.type === 'MACD') return null;
    const key = Object.keys(ind.params)[0];
    return key ? { key, value: ind.params[key] } : null;
}

export default function IndicatorPanel({ indicators, onChange }: IndicatorPanelProps) {
    const toggleIndicator = (id: string) => {
        onChange(
            indicators.map(ind =>
                ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
            )
        );
    };

    const adjustParam = (id: string, paramKey: string, delta: number) => {
        onChange(
            indicators.map(ind => {
                if (ind.id !== id) return ind;
                const newVal = Math.max(1, Math.min(200, (ind.params[paramKey] || 1) + delta));
                return { ...ind, params: { ...ind.params, [paramKey]: newVal } };
            })
        );
    };

    return (
        <div className={styles.panel}>
            <div className={styles.panelLabel}>Indicators</div>
            <div className={styles.indicators}>
                {indicators.map(ind => {
                    const param = mainParam(ind);
                    return (
                        <div key={ind.id} className={styles.slot}>
                            {/* Up arrow — only when enabled */}
                            {ind.enabled && param && (
                                <button
                                    className={styles.arrow}
                                    onClick={() => adjustParam(ind.id, param.key, 1)}
                                    title={`Increase period (${param.value} → ${param.value + 1})`}
                                >
                                    ▲
                                </button>
                            )}

                            {/* Pill */}
                            <button
                                className={`${styles.pill} ${ind.enabled ? styles.active : ''}`}
                                onClick={() => toggleIndicator(ind.id)}
                                style={ind.enabled ? { borderColor: ind.color } : undefined}
                            >
                                <span
                                    className={styles.dot}
                                    style={{ background: ind.enabled ? ind.color : 'var(--text-muted)' }}
                                />
                                {TYPE_LABELS[ind.type]}
                            </button>

                            {/* Down arrow — only when enabled */}
                            {ind.enabled && param && (
                                <button
                                    className={styles.arrow}
                                    onClick={() => adjustParam(ind.id, param.key, -1)}
                                    title={`Decrease period (${param.value} → ${Math.max(1, param.value - 1)})`}
                                >
                                    ▼
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
