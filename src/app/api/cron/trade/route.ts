
import { NextRequest, NextResponse } from 'next/server';
import { fetchBinanceCandles } from '@/lib/binance';
import { TradingEngine } from '@/core/engine';
import { loadShadowPortfolioState, saveShadowPortfolioState, saveShadowTrade, saveShadowDecision } from '@/db';
import { openPosition, closePosition } from '@/core/trading';
import { Trade } from '@/core/trading/types';
import { sendPushNotification } from '@/lib/notify';

const MAX_HOLD_MS = 4 * 60 * 60 * 1000; // 4 hours max hold
const SL_PCT = 0.015; // 1.5% stop loss
const TP_PCT = 0.030; // 3.0% take profit (2:1 R:R)

export async function GET(req: NextRequest) {
    // 1. Security Check
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('key');
    const CRON_SECRET = process.env.CRON_SECRET || '1234';

    if (secret !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const symbol = 'BTCUSDT';
    const timeframe = '1h';

    try {
        // 2. Fetch Data — 250 candles so TrendSignal has enough for EMA200
        const candles = await fetchBinanceCandles(symbol, timeframe, 250);
        if (candles.length < 50) return NextResponse.json({ error: 'Not enough data' });

        const currentPrice = candles[candles.length - 1].close;

        // 3. Run Engine (now includes regime label)
        const engine = new TradingEngine();
        const decision = engine.evaluate(candles, symbol, 'NEUTRAL');

        // 4. Load Portfolio (Shadow)
        const portfolioState = await loadShadowPortfolioState();
        let portfolio = {
            balance: portfolioState.balance,
            positions: portfolioState.positions,
            trades: [] as Trade[]
        };

        let executedTrade: Trade | null = null;
        let actionTaken = 'NONE';

        const existingPosition = portfolio.positions.find(p => p.symbol === symbol);

        // ─── 5a. Max-hold timeout: force-close stale positions ───
        if (existingPosition && (Date.now() - existingPosition.openTime) > MAX_HOLD_MS) {
            const duration = Date.now() - existingPosition.openTime;
            portfolio = closePosition(portfolio, existingPosition.id, currentPrice);
            executedTrade = portfolio.trades[portfolio.trades.length - 1];
            actionTaken = 'TIMEOUT_CLOSE';

            if (executedTrade) {
                await saveShadowTrade(executedTrade, JSON.stringify({
                    score: 0,
                    reason: `Timeout: held for ${Math.round(duration / 60000)}m`,
                    regime: decision.regime,
                    timestamp: Date.now()
                }));

                // Notify: Timeout Close
                const pnl = executedTrade.pnl;
                const emoji = pnl >= 0 ? '💰' : '💸';
                await sendPushNotification(
                    `⏰ Timeout Close: ${existingPosition.side}`,
                    `Force closed after 4h. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} ${emoji}\nRegime: ${decision.regime}`
                );
            }

            await saveShadowDecision({
                timestamp: Date.now(),
                symbol,
                action: 'TIMEOUT_CLOSE',
                score: 0,
                reason: `Max hold exceeded (${Math.round(duration / 60000)}m). Force closed at $${currentPrice.toFixed(2)}. Regime: ${decision.regime}`,
                hadPosition: true,
                positionSide: existingPosition.side,
                positionPnlPct: ((currentPrice - existingPosition.entryPrice) / existingPosition.entryPrice * 100 * (existingPosition.side === 'LONG' ? 1 : -1)),
                executed: true,
                result: `Closed ${existingPosition.side} for PnL: ${executedTrade?.pnl?.toFixed(2) || '?'}`,
            });

            await saveShadowPortfolioState(portfolio);

            return NextResponse.json({
                success: true,
                symbol,
                price: currentPrice,
                decision: 'TIMEOUT_CLOSE',
                reason: `Max hold exceeded, force closed`,
                actionTaken,
                regime: decision.regime,
                regimeReason: decision.regimeReason,
                balance: portfolio.balance
            });
        }

        // ─── 5b. SL/TP check for existing positions ─────────────
        if (existingPosition) {
            let shouldClose = false;
            let closeReason = '';
            let isWin = false;

            if (existingPosition.side === 'LONG') {
                if (existingPosition.stopLoss !== null && currentPrice <= existingPosition.stopLoss) {
                    shouldClose = true;
                    closeReason = `SL hit at $${existingPosition.stopLoss.toFixed(2)}`;
                    isWin = false;
                }
                if (existingPosition.takeProfit !== null && currentPrice >= existingPosition.takeProfit) {
                    shouldClose = true;
                    closeReason = `TP hit at $${existingPosition.takeProfit.toFixed(2)}`;
                    isWin = true;
                }
            } else {
                if (existingPosition.stopLoss !== null && currentPrice >= existingPosition.stopLoss) {
                    shouldClose = true;
                    closeReason = `SL hit at $${existingPosition.stopLoss.toFixed(2)}`;
                    isWin = false;
                }
                if (existingPosition.takeProfit !== null && currentPrice <= existingPosition.takeProfit) {
                    shouldClose = true;
                    closeReason = `TP hit at $${existingPosition.takeProfit.toFixed(2)}`;
                    isWin = true;
                }
            }

            if (shouldClose) {
                portfolio = closePosition(portfolio, existingPosition.id, currentPrice);
                executedTrade = portfolio.trades[portfolio.trades.length - 1];
                actionTaken = 'SL_TP_CLOSE';

                if (executedTrade) {
                    await saveShadowTrade(executedTrade, JSON.stringify({
                        score: 0,
                        reason: closeReason,
                        regime: decision.regime,
                        timestamp: Date.now()
                    }));

                    // Notify: SL/TP Hit
                    const pnl = executedTrade.pnl;
                    const emoji = isWin ? '🎯' : '🛑';
                    await sendPushNotification(
                        `${emoji} ${isWin ? 'Take Profit' : 'Stop Loss'} Hit`,
                        `${existingPosition.side} closed. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\nRegime: ${decision.regime}`
                    );
                }

                await saveShadowDecision({
                    timestamp: Date.now(),
                    symbol,
                    action: 'SL_TP_CLOSE',
                    score: 0,
                    reason: `${closeReason} (price: $${currentPrice.toFixed(2)}). Regime: ${decision.regime}`,
                    hadPosition: true,
                    positionSide: existingPosition.side,
                    positionPnlPct: ((currentPrice - existingPosition.entryPrice) / existingPosition.entryPrice * 100 * (existingPosition.side === 'LONG' ? 1 : -1)),
                    executed: true,
                    result: `Closed ${existingPosition.side} for PnL: ${executedTrade?.pnl?.toFixed(2) || '?'}`,
                });

                await saveShadowPortfolioState(portfolio);

                return NextResponse.json({
                    success: true,
                    symbol,
                    price: currentPrice,
                    decision: 'SL_TP_CLOSE',
                    reason: closeReason,
                    actionTaken,
                    regime: decision.regime,
                    regimeReason: decision.regimeReason,
                    balance: portfolio.balance
                });
            }
        }

        // ─── 5c. Execute trading decision ────────────────────────
        const currentPosition = portfolio.positions.find(p => p.symbol === symbol);

        // BUY
        if (decision.action === 'BUY') {
            if (currentPosition && currentPosition.side === 'SHORT') {
                portfolio = closePosition(portfolio, currentPosition.id, currentPrice);
                executedTrade = portfolio.trades[portfolio.trades.length - 1];
                actionTaken = 'CLOSE_SHORT';

                if (executedTrade) {
                    await saveShadowTrade(executedTrade, JSON.stringify({
                        score: decision.score,
                        reason: decision.reason,
                        regime: decision.regime,
                        timestamp: decision.timestamp
                    }));

                    // Notify: Close Short
                    const pnl = executedTrade.pnl;
                    await sendPushNotification(
                        `🔄 Reversal: Closed SHORT`,
                        `PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}. Flipping to LONG.`
                    );
                }
            }

            const isFlat = !portfolio.positions.some(p => p.symbol === symbol);
            if (isFlat) {
                const q = (portfolio.balance * 0.95) / currentPrice;
                if (q > 0 && portfolio.balance > 10) {
                    const sl = currentPrice * (1 - SL_PCT);
                    const tp = currentPrice * (1 + TP_PCT);
                    portfolio = openPosition(portfolio, {
                        symbol,
                        side: 'LONG',
                        quantity: q,
                        entryPrice: currentPrice,
                        stopLoss: sl,
                        takeProfit: tp,
                    });
                    actionTaken = actionTaken === 'NONE' ? 'OPEN_LONG' : 'REVERSE_LONG';

                    // Notify: Open LONG
                    await sendPushNotification(
                        `🚀 Opened LONG @ $${currentPrice.toFixed(0)}`,
                        `Regime: ${decision.regime}\nReason: ${decision.reason}`
                    );
                }
            }
        }
        // SELL
        else if (decision.action === 'SELL') {
            if (currentPosition && currentPosition.side === 'LONG') {
                portfolio = closePosition(portfolio, currentPosition.id, currentPrice);
                executedTrade = portfolio.trades[portfolio.trades.length - 1];
                actionTaken = 'CLOSE_LONG';

                if (executedTrade) {
                    await saveShadowTrade(executedTrade, JSON.stringify({
                        score: decision.score,
                        reason: decision.reason,
                        regime: decision.regime,
                        timestamp: decision.timestamp
                    }));

                    // Notify: Close Long
                    const pnl = executedTrade.pnl;
                    await sendPushNotification(
                        `🔄 Reversal: Closed LONG`,
                        `PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}. Flipping to SHORT.`
                    );
                }
            }

            const isFlat = !portfolio.positions.some(p => p.symbol === symbol);
            if (isFlat) {
                const q = (portfolio.balance * 0.95) / currentPrice;
                if (q > 0 && portfolio.balance > 10) {
                    const sl = currentPrice * (1 + SL_PCT);
                    const tp = currentPrice * (1 - TP_PCT);
                    portfolio = openPosition(portfolio, {
                        symbol,
                        side: 'SHORT',
                        quantity: q,
                        entryPrice: currentPrice,
                        stopLoss: sl,
                        takeProfit: tp,
                    });
                    actionTaken = actionTaken === 'NONE' ? 'OPEN_SHORT' : 'REVERSE_SHORT';

                    // Notify: Open SHORT
                    await sendPushNotification(
                        `📉 Opened SHORT @ $${currentPrice.toFixed(0)}`,
                        `Regime: ${decision.regime}\nReason: ${decision.reason}`
                    );
                }
            }
        }

        // 6. Persist portfolio
        if (actionTaken !== 'NONE') {
            await saveShadowPortfolioState(portfolio);
        }

        // 7. Log every decision (even HOLD)
        const pnlPct = currentPosition
            ? ((currentPrice - currentPosition.entryPrice) / currentPosition.entryPrice * 100 * (currentPosition.side === 'LONG' ? 1 : -1))
            : undefined;

        await saveShadowDecision({
            timestamp: Date.now(),
            symbol,
            action: decision.action,
            score: decision.score,
            reason: `${decision.reason} | Regime: ${decision.regime} — ${decision.regimeReason}`,
            hadPosition: !!currentPosition,
            positionSide: currentPosition?.side,
            positionPnlPct: pnlPct,
            executed: actionTaken !== 'NONE',
            result: actionTaken !== 'NONE'
                ? `${actionTaken} at $${currentPrice.toFixed(2)}`
                : (currentPosition ? `Holding ${currentPosition.side}` : 'No position, waiting'),
        });

        return NextResponse.json({
            success: true,
            symbol,
            price: currentPrice,
            decision: decision.action,
            score: decision.score,
            reason: decision.reason,
            regime: decision.regime,
            regimeReason: decision.regimeReason,
            actionTaken,
            balance: portfolio.balance
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
