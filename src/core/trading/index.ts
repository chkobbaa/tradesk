/**
 * Trading Simulator — Core Engine
 *
 * Pure functions for position management, PnL calculation, and fee handling.
 * All state is immutable — functions return new Portfolio objects.
 */

import {
    Portfolio,
    Position,
    Trade,
    OrderRequest,
    OrderSide,
    FeeConfig,
    DEFAULT_FEES,
    INITIAL_BALANCE,
} from './types';

export * from './types';

// ─── Portfolio Factory ─────────────────────────────────────────

export function createPortfolio(balance: number = INITIAL_BALANCE): Portfolio {
    return { balance, positions: [], trades: [] };
}

// ─── Fee Calculation ───────────────────────────────────────────

export function calculateFee(
    quantity: number,
    price: number,
    feeRate: number,
): number {
    return quantity * price * feeRate;
}

// ─── Open Position ─────────────────────────────────────────────

let _positionCounter = 0;

export function openPosition(
    portfolio: Portfolio,
    order: OrderRequest,
    fees: FeeConfig = DEFAULT_FEES,
): Portfolio {
    const cost = order.quantity * order.entryPrice;
    const fee = calculateFee(order.quantity, order.entryPrice, fees.takerFee);
    const totalCost = cost + fee;

    if (totalCost > portfolio.balance) {
        throw new Error(
            `Insufficient balance: need $${totalCost.toFixed(2)} but have $${portfolio.balance.toFixed(2)}`
        );
    }

    if (order.quantity <= 0) {
        throw new Error('Quantity must be positive');
    }

    const position: Position = {
        id: `pos-${Date.now()}-${++_positionCounter}`,
        symbol: order.symbol,
        side: order.side,
        entryPrice: order.entryPrice,
        quantity: order.quantity,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        openTime: Date.now(),
        entryFee: fee,
    };

    return {
        ...portfolio,
        balance: portfolio.balance - totalCost,
        positions: [...portfolio.positions, position],
    };
}

// ─── Close Position ────────────────────────────────────────────

export function closePosition(
    portfolio: Portfolio,
    positionId: string,
    exitPrice: number,
    fees: FeeConfig = DEFAULT_FEES,
): Portfolio {
    const posIdx = portfolio.positions.findIndex(p => p.id === positionId);
    if (posIdx === -1) throw new Error(`Position ${positionId} not found`);

    const pos = portfolio.positions[posIdx];
    const exitFee = calculateFee(pos.quantity, exitPrice, fees.takerFee);
    const rawPnL = calculateRawPnL(pos, exitPrice);
    const netPnL = rawPnL - pos.entryFee - exitFee;

    // Return value = exit proceeds + net PnL effect
    const exitProceeds = pos.side === 'LONG'
        ? pos.quantity * exitPrice - exitFee
        : pos.quantity * (2 * pos.entryPrice - exitPrice) - exitFee;

    const trade: Trade = {
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        quantity: pos.quantity,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        openTime: pos.openTime,
        closeTime: Date.now(),
        entryFee: pos.entryFee,
        exitFee,
        pnl: netPnL,
    };

    const newPositions = [...portfolio.positions];
    newPositions.splice(posIdx, 1);

    return {
        ...portfolio,
        balance: portfolio.balance + exitProceeds,
        positions: newPositions,
        trades: [...portfolio.trades, trade],
    };
}

// ─── PnL Calculations ─────────────────────────────────────────

/** Raw PnL before fees */
function calculateRawPnL(position: Position, currentPrice: number): number {
    const diff = currentPrice - position.entryPrice;
    return position.side === 'LONG'
        ? diff * position.quantity
        : -diff * position.quantity;
}

/** Unrealized PnL for a single position (after fees estimate) */
export function calculateUnrealizedPnL(
    position: Position,
    currentPrice: number,
    fees: FeeConfig = DEFAULT_FEES,
): number {
    const raw = calculateRawPnL(position, currentPrice);
    const estimatedExitFee = calculateFee(position.quantity, currentPrice, fees.takerFee);
    return raw - position.entryFee - estimatedExitFee;
}

/** Total unrealized PnL across all open positions */
export function calculateTotalUnrealizedPnL(
    positions: Position[],
    currentPrice: number,
    fees: FeeConfig = DEFAULT_FEES,
): number {
    return positions.reduce(
        (sum, pos) => sum + calculateUnrealizedPnL(pos, currentPrice, fees),
        0,
    );
}

/** Equity = balance + sum of position values at current prices */
export function calculateEquity(
    portfolio: Portfolio,
    currentPrice: number,
): number {
    const positionValues = portfolio.positions.reduce(
        (sum, pos) => {
            if (pos.side === 'LONG') {
                return sum + pos.quantity * currentPrice;
            } else {
                // For SHORT: Value = Cost + PnL = Q*Entry + Q*(Entry-Current) = Q*(2*Entry-Current)
                return sum + pos.quantity * (2 * pos.entryPrice - currentPrice);
            }
        },
        0,
    );
    return portfolio.balance + positionValues;
}

// ─── Stop Loss / Take Profit ───────────────────────────────────

/**
 * Check all positions for SL/TP triggers.
 * Returns a new portfolio with triggered positions auto-closed.
 */
export function checkStopLossTakeProfit(
    portfolio: Portfolio,
    currentPrice: number,
    fees: FeeConfig = DEFAULT_FEES,
): { portfolio: Portfolio; triggered: Trade[] } {
    const triggered: Trade[] = [];
    let current = portfolio;

    for (const pos of [...current.positions]) {
        let shouldClose = false;

        if (pos.side === 'LONG') {
            if (pos.stopLoss !== null && currentPrice <= pos.stopLoss) shouldClose = true;
            if (pos.takeProfit !== null && currentPrice >= pos.takeProfit) shouldClose = true;
        } else {
            // SHORT
            if (pos.stopLoss !== null && currentPrice >= pos.stopLoss) shouldClose = true;
            if (pos.takeProfit !== null && currentPrice <= pos.takeProfit) shouldClose = true;
        }

        if (shouldClose) {
            const closePrice = pos.side === 'LONG'
                ? (pos.stopLoss !== null && currentPrice <= pos.stopLoss ? pos.stopLoss : pos.takeProfit!)
                : (pos.stopLoss !== null && currentPrice >= pos.stopLoss ? pos.stopLoss : pos.takeProfit!);

            current = closePosition(current, pos.id, closePrice, fees);
            const lastTrade = current.trades[current.trades.length - 1];
            triggered.push(lastTrade);
        }
    }

    return { portfolio: current, triggered };
}

// ─── Trade Stats ───────────────────────────────────────────────

export function calculateTradeStats(trades: Trade[]) {
    if (trades.length === 0) {
        return { totalPnL: 0, winRate: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0 };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    return {
        totalPnL: trades.reduce((s, t) => s + t.pnl, 0),
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        wins: wins.length,
        losses: losses.length,
        avgWin: wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
        avgLoss: losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0,
    };
}
