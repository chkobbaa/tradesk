/**
 * Trading Simulator — Core Types
 */

export type OrderSide = 'LONG' | 'SHORT';

export interface FeeConfig {
    makerFee: number;  // e.g. 0.001 = 0.1%
    takerFee: number;
}

export const DEFAULT_FEES: FeeConfig = {
    makerFee: 0,
    takerFee: 0,
};

export const INITIAL_BALANCE = 10_000;

/** An open position */
export interface Position {
    id: string;
    symbol: string;
    side: OrderSide;
    entryPrice: number;
    quantity: number;
    stopLoss: number | null;
    takeProfit: number | null;
    openTime: number;       // Unix ms
    entryFee: number;       // Fee paid when opening
}

/** A closed trade */
export interface Trade {
    id: string;
    symbol: string;
    side: OrderSide;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    stopLoss: number | null;
    takeProfit: number | null;
    openTime: number;
    closeTime: number;
    entryFee: number;
    exitFee: number;
    pnl: number;            // Net PnL after fees
}

/** Full portfolio state */
export interface Portfolio {
    balance: number;         // Available cash (USDT)
    positions: Position[];
    trades: Trade[];
}

export interface OrderRequest {
    symbol: string;
    side: OrderSide;
    quantity: number;
    entryPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
}
