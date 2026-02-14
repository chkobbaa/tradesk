
import { SignalGenerator, SignalContext, SignalResult, SignalDirection } from './types';

export class MacroSignal implements SignalGenerator {
    name = 'Macro-Manual';

    private currentSentiment: SignalDirection = 'NEUTRAL';

    setSentiment(sentiment: SignalDirection) {
        this.currentSentiment = sentiment;
    }

    evaluate(context: SignalContext): SignalResult {
        return {
            source: this.name,
            direction: this.currentSentiment,
            confidence: 1.0, // Manual input is absolute truth
            horizon: 'SWING',
            reason: `Manual Override: ${this.currentSentiment}`,
            timestamp: Date.now(),
        };
    }
}
