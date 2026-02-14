/**
 * Indicator Engine — Barrel Export + Dispatcher
 */

export { calculateSMA } from './sma';
export { calculateEMA } from './ema';
export { calculateRSI } from './rsi';
export { calculateMACD } from './macd';
export { calculateATR } from './atr';
export * from './types';

import { Candle } from '@/core/market/types';
import { IndicatorConfig, IndicatorOutput } from './types';
import { calculateSMA } from './sma';
import { calculateEMA } from './ema';
import { calculateRSI } from './rsi';
import { calculateMACD } from './macd';

/**
 * Compute a single indicator's output from candles + config.
 */
export function computeIndicator(
    candles: Candle[],
    config: IndicatorConfig,
): IndicatorOutput {
    switch (config.type) {
        case 'SMA':
            return {
                config,
                data: calculateSMA(candles, config.params.period),
            };
        case 'EMA':
            return {
                config,
                data: calculateEMA(candles, config.params.period),
            };
        case 'RSI':
            return {
                config,
                data: calculateRSI(candles, config.params.period),
            };
        case 'MACD':
            return {
                config,
                data: [],
                macdData: calculateMACD(
                    candles,
                    config.params.fast,
                    config.params.slow,
                    config.params.signal,
                ),
            };
        default:
            return { config, data: [] };
    }
}

/**
 * Compute all enabled indicators at once.
 */
export function computeAllIndicators(
    candles: Candle[],
    configs: IndicatorConfig[],
): IndicatorOutput[] {
    return configs
        .filter(c => c.enabled)
        .map(c => computeIndicator(candles, c));
}
