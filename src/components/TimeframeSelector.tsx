'use client';

import { TIMEFRAMES, TIMEFRAME_LABELS, Timeframe } from '@/core/market/types';

interface TimeframeSelectorProps {
    value: Timeframe;
    onChange: (tf: Timeframe) => void;
}

export default function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
    return (
        <div className="tf-selector">
            {TIMEFRAMES.map((tf) => (
                <button
                    key={tf}
                    className={tf === value ? 'active' : ''}
                    onClick={() => onChange(tf)}
                >
                    {TIMEFRAME_LABELS[tf]}
                </button>
            ))}
        </div>
    );
}
