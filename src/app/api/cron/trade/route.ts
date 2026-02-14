
import { NextRequest, NextResponse } from 'next/server';
import { fetchBinanceCandles } from '@/lib/binance';
import { TradingEngine } from '@/core/engine';
import { loadShadowPortfolioState, saveShadowPortfolioState, saveShadowTrade } from '@/db';
import { openPosition, closePosition } from '@/core/trading';
import { Trade } from '@/core/trading/types';

export async function GET(req: NextRequest) {
    // 1. Security Check (Basic Secret Key)
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('key');
    const CRON_SECRET = process.env.CRON_SECRET || '1234';
    // In production, user must set CRON_SECRET in env vars.

    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const symbol = 'BTCUSDT';
    const timeframe = '1h';

    try {
        // 2. Fetch Data
        const candles = await fetchBinanceCandles(symbol, timeframe, 100);
        if (candles.length < 50) return NextResponse.json({ error: 'Not enough data' });

        const currentPrice = candles[candles.length - 1].close;

        // 3. Run Engine
        const engine = new TradingEngine();
        const decision = engine.evaluate(candles, symbol, 'NEUTRAL'); // TODO: Fetch Macro from DB?

        // 4. Load Portfolio (Shadow)
        const portfolioState = await loadShadowPortfolioState();
        let portfolio = {
            balance: portfolioState.balance,
            positions: portfolioState.positions,
            trades: [] as Trade[] // We don't need history to execute, just positions
        };

        let executedTrade: Trade | null = null;
        let actionTaken = 'NONE';

        // 5. Execute Logic (Similar to useShadowTrader)
        const existingPosition = portfolio.positions.find(p => p.symbol === symbol);

        // Buying
        if (decision.action === 'BUY') {
            if (existingPosition && existingPosition.side === 'SHORT') {
                portfolio = closePosition(portfolio, existingPosition.id, currentPrice);
                executedTrade = portfolio.trades[portfolio.trades.length - 1]; // This needs verification if closePosition adds to trade array
                actionTaken = 'CLOSE_SHORT';
            }

            const isFlat = !portfolio.positions.some(p => p.symbol === symbol);
            if (isFlat) {
                const q = (portfolio.balance * 0.95) / currentPrice;
                if (q > 0) {
                    portfolio = openPosition(portfolio, {
                        symbol,
                        side: 'LONG',
                        quantity: q,
                        entryPrice: currentPrice,
                        stopLoss: null,
                        takeProfit: null
                    });
                    actionTaken = actionTaken === 'NONE' ? 'OPEN_LONG' : 'REVERSE_LONG';
                }
            }
        }
        // Selling
        else if (decision.action === 'SELL') {
            if (existingPosition && existingPosition.side === 'LONG') {
                portfolio = closePosition(portfolio, existingPosition.id, currentPrice);
                executedTrade = portfolio.trades[portfolio.trades.length - 1];
                actionTaken = 'CLOSE_LONG';
            }

            const isFlat = !portfolio.positions.some(p => p.symbol === symbol);
            if (isFlat) {
                const q = (portfolio.balance * 0.95) / currentPrice;
                if (q > 0) {
                    portfolio = openPosition(portfolio, {
                        symbol,
                        side: 'SHORT',
                        quantity: q,
                        entryPrice: currentPrice,
                        stopLoss: null,
                        takeProfit: null
                    });
                    actionTaken = actionTaken === 'NONE' ? 'OPEN_SHORT' : 'REVERSE_SHORT';
                }
            }
        }

        // 6. Persist
        if (actionTaken !== 'NONE') {
            await saveShadowPortfolioState(portfolio);
            if (executedTrade) {
                const snapshot = JSON.stringify({
                    score: decision.score,
                    reason: decision.reason,
                    timestamp: decision.timestamp
                });
                await saveShadowTrade(executedTrade, snapshot);
            }
        }

        return NextResponse.json({
            success: true,
            symbol,
            price: currentPrice,
            decision: decision.action,
            reason: decision.reason,
            actionTaken,
            balance: portfolio.balance
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
