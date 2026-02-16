
import { NextRequest, NextResponse } from 'next/server';
import { loadShadowPortfolioState, saveShadowPortfolioState, saveShadowTrade, saveShadowDecision } from '@/db';
import { closePosition } from '@/core/trading';
import { fetchBinanceCandles } from '@/lib/binance';
import { sendPushNotification } from '@/lib/notify';
import { Trade } from '@/core/trading/types';
import { resolveChatIdentity, setChatIdentityCookie } from '@/lib/chatIdentity';

export async function POST(req: NextRequest) {
    let identity: Awaited<ReturnType<typeof resolveChatIdentity>> | null = null;
    try {
        identity = await resolveChatIdentity(req);
        const body = await req.json();
        const { positionIds } = body as { positionIds: string[] };

        if (!positionIds || !Array.isArray(positionIds) || positionIds.length === 0) {
            return NextResponse.json({ error: 'Invalid positionIds' }, { status: 400 });
        }

        const portfolioState = await loadShadowPortfolioState(identity.userId);
        let portfolio = {
            balance: portfolioState.balance,
            positions: portfolioState.positions,
            trades: [] as Trade[] // trades array is not persisted here, only new trades
        };

        const closedTrades: Trade[] = [];
        const errors: string[] = [];

        // Process each position
        for (const pid of positionIds) {
            const position = portfolio.positions.find(p => p.id === pid);
            if (!position) {
                errors.push(`Position ${pid} not found`);
                continue;
            }

            // Fetch live price
            // We fetch 2 candles to be safe, but we only need the latest close
            const candles = await fetchBinanceCandles(position.symbol, '1m', 2);
            if (candles.length === 0) {
                errors.push(`Could not fetch price for ${position.symbol}`);
                continue;
            }
            const currentPrice = candles[candles.length - 1].close;

            // Close
            portfolio = closePosition(portfolio, pid, currentPrice);
            const executedTrade = portfolio.trades[portfolio.trades.length - 1];

            if (executedTrade) {
                closedTrades.push(executedTrade);

                // Save trade
                await saveShadowTrade(identity.userId, executedTrade, JSON.stringify({
                    score: 0,
                    reason: 'Manual Close via Dashboard',
                    timestamp: Date.now()
                }));

                // Log decision
                await saveShadowDecision(identity.userId, {
                    timestamp: Date.now(),
                    symbol: position.symbol,
                    action: 'MANUAL_CLOSE',
                    score: 0,
                    reason: `User manually closed position at $${currentPrice.toFixed(2)}`,
                    hadPosition: true,
                    positionSide: position.side,
                    positionPnlPct: ((currentPrice - position.entryPrice) / position.entryPrice * 100 * (position.side === 'LONG' ? 1 : -1)),
                    executed: true,
                    result: `Closed ${position.side} for PnL: ${executedTrade.pnl.toFixed(2)}`,
                });

                // Notify
                const pnl = executedTrade.pnl;
                const emoji = pnl >= 0 ? '💰' : '💸';
                await sendPushNotification(
                    `👋 Manual Close: ${position.side}`,
                    `Closed ${position.symbol} at $${currentPrice.toFixed(2)}. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} ${emoji}`
                );
            }
        }

        // Save updated portfolio
        if (closedTrades.length > 0) {
            await saveShadowPortfolioState(identity.userId, portfolio);
        }

        const res = NextResponse.json({
            success: true,
            closedCount: closedTrades.length,
            errors,
            newBalance: portfolio.balance
        });
        if (identity.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;

    } catch (error: unknown) {
        console.error('Manual close error:', error);
        const res = NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
        if (identity?.shouldSetCookie) {
            setChatIdentityCookie(res, identity.deviceId);
        }
        return res;
    }
}
