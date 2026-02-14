/**
 * Core market data types.
 * These are the normalized types used throughout the app —
 * regardless of which exchange provides the data.
 */

export interface Candle {
  time: number;       // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m':  '1m',
  '5m':  '5m',
  '15m': '15m',
  '1h':  '1H',
  '4h':  '4H',
  '1d':  '1D',
};

export interface MarketSymbol {
  symbol: string;       // e.g. "BTCUSDT"
  baseAsset: string;    // e.g. "BTC"
  quoteAsset: string;   // e.g. "USDT"
}

export interface CandleRequest {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;       // max 1000 on Binance
}

export class MarketError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly source?: string,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}
