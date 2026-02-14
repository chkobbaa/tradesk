
import { SignalResult, SignalDirection, TradeDecision } from '@/core/signals';
import styles from './SignalPanel.module.css';

interface SignalPanelProps {
    signals: SignalResult[];
    decision: TradeDecision | null;
    macroSentiment: SignalDirection;
    onMacroChange: (sentiment: SignalDirection) => void;
}

export const SignalPanel: React.FC<SignalPanelProps> = ({ signals, decision, macroSentiment, onMacroChange }) => {

    const getDirectionClass = (dir: SignalDirection) => {
        if (dir === 'LONG') return styles.long;
        if (dir === 'SHORT') return styles.short;
        return styles.neutral;
    };

    const getActionClass = (action: string) => {
        if (action === 'BUY') return styles.long;
        if (action === 'SELL') return styles.short;
        return styles.neutral;
    };

    return (
        <div className={styles.panel}>
            <div className={styles.header}>Signal Registry (Brain)</div>

            {decision && (
                <div className={styles.decisionCard}>
                    <div className={styles.decisionTitle}>FINAL DECISION (Prefrontal Cortex)</div>
                    <div className={styles.decisionRow}>
                        <div className={`${styles.decisionAction} ${getActionClass(decision.action)}`}>
                            {decision.action}
                        </div>
                        <div className={styles.decisionScore}>
                            Score: {decision.score.toFixed(2)}
                        </div>
                    </div>
                    <div className={styles.decisionReason}>
                        {decision.reason}
                    </div>
                </div>
            )}

            <div className={styles.grid}>
                {signals.map((sig, idx) => (
                    <div key={idx} className={styles.card}>
                        <div className={styles.cardHeader}>
                            <span>{sig.source}</span>
                            <span>{sig.horizon}</span>
                        </div>
                        <div className={`${styles.cardValue} ${getDirectionClass(sig.direction)}`}>
                            {sig.direction}
                        </div>
                        <div className={styles.reason}>{sig.reason}</div>
                        <div className={styles.confidence}>
                            Conf: {(sig.confidence * 100).toFixed(0)}%
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.macroSection}>
                <div className={styles.macroTitle}>GOD MODE (Macro Override)</div>
                <div className={styles.toggles}>
                    <button
                        className={`${styles.toggleBtn} ${macroSentiment === 'LONG' ? styles.activeLong : ''}`}
                        onClick={() => onMacroChange('LONG')}
                    >
                        Risk On (Bull)
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${macroSentiment === 'NEUTRAL' ? styles.activeNeutral : ''}`}
                        onClick={() => onMacroChange('NEUTRAL')}
                    >
                        Neutral
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${macroSentiment === 'SHORT' ? styles.activeShort : ''}`}
                        onClick={() => onMacroChange('SHORT')}
                    >
                        Risk Off (Bear)
                    </button>
                </div>
            </div>
        </div>
    );
};
