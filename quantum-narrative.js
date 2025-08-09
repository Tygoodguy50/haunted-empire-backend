// Quantum-Inspired Narrative Engine
// Simplified quantum mechanics for web-based horror storytelling

class QuantumNarrative {
    constructor() {
        this.narrativeStates = {
            temporal: ['linear', 'folded', 'stretched', 'recursive'],
            tension: ['building', 'peak', 'release', 'reset'],
            reality: ['stable', 'shifting', 'fractured', 'collapsed']
        };
        
        this.entanglements = {
            'linear': ['building', 'stable'],
            'folded': ['peak', 'shifting'],
            'stretched': ['release', 'fractured'],
            'recursive': ['reset', 'collapsed']
        };
    }

    // Simulate quantum superposition with weighted randomness
    createSuperposition(states) {
        const weights = states.map(() => Math.random());
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        return weights.map(w => w / totalWeight);
    }

    // Simulate quantum entanglement between narrative elements
    entangleStates(state1, state2) {
        const entangled = this.entanglements[state1];
        if (entangled && entangled.includes(state2)) {
            return { entangled: true, correlation: 0.8 };
        }
        return { entangled: false, correlation: Math.random() * 0.5 };
    }

    // Collapse quantum state into specific narrative outcome
    measureNarrativeState() {
        const temporal = this.collapseState(this.narrativeStates.temporal);
        const tension = this.collapseState(this.narrativeStates.tension);
        const reality = this.collapseState(this.narrativeStates.reality);

        // Apply entanglement effects
        const entanglement = this.entangleStates(temporal, tension);
        
        return {
            temporal,
            tension,
            reality,
            entanglement,
            coherence: this.calculateCoherence(temporal, tension, reality),
            timestamp: Date.now()
        };
    }

    // Simulate wave function collapse
    collapseState(states) {
        const probabilities = this.createSuperposition(states);
        const random = Math.random();
        let accumulator = 0;
        
        for (let i = 0; i < states.length; i++) {
            accumulator += probabilities[i];
            if (random < accumulator) {
                return states[i];
            }
        }
        return states[states.length - 1];
    }

    // Calculate narrative coherence based on quantum state
    calculateCoherence(temporal, tension, reality) {
        const stateValues = {
            'linear': 1.0, 'folded': 0.7, 'stretched': 0.5, 'recursive': 0.3,
            'building': 0.8, 'peak': 1.0, 'release': 0.6, 'reset': 0.2,
            'stable': 1.0, 'shifting': 0.7, 'fractured': 0.4, 'collapsed': 0.1
        };
        
        return (stateValues[temporal] + stateValues[tension] + stateValues[reality]) / 3;
    }

    // Generate horror-specific quantum narrative prompts
    generateQuantumPrompt(narrativeState) {
        const prompts = {
            'linear-building-stable': 'The story unfolds in perfect chronological order, but something sinister builds beneath the surface...',
            'folded-peak-shifting': 'Time bends back on itself as terror reaches its climax, reality warping around the protagonist...',
            'stretched-release-fractured': 'Moments stretch into eternity as tension breaks, leaving fragments of a shattered timeline...',
            'recursive-reset-collapsed': 'The same horrific events repeat endlessly as reality crumbles into quantum uncertainty...'
        };

        const key = `${narrativeState.temporal}-${narrativeState.tension}-${narrativeState.reality}`;
        return prompts[key] || `Quantum narrative state: ${JSON.stringify(narrativeState)}`;
    }

    // Integration with existing AI writing tools
    enhanceAIPrompt(userPrompt, quantumState) {
        const quantumEnhancement = this.generateQuantumPrompt(quantumState);
        return {
            originalPrompt: userPrompt,
            quantumEnhancement,
            combinedPrompt: `${userPrompt}\n\nQuantum Narrative Context: ${quantumEnhancement}`,
            coherence: quantumState.coherence,
            metadata: {
                quantumState,
                experimentalFeature: true,
                timestamp: Date.now()
            }
        };
    }
}

// Export for backend use
module.exports = QuantumNarrative;

// Example usage for testing
if (require.main === module) {
    const qn = new QuantumNarrative();
    console.log('=== QUANTUM NARRATIVE ENGINE TEST ===');
    
    for (let i = 0; i < 5; i++) {
        const state = qn.measureNarrativeState();
        const prompt = qn.generateQuantumPrompt(state);
        console.log(`\nQuantum State ${i + 1}:`, state);
        console.log('Generated Prompt:', prompt);
    }
}
