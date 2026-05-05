// Per-persona + per-run cost tracker. Aborts when caps exceeded.

const { tokensCost } = require('./anthropic-client');

class CostTracker {
  constructor({ runCap = 30, personaCap = 1, superBrainCap = 5 } = {}) {
    this.runCap = runCap;
    this.personaCap = personaCap;
    this.superBrainCap = superBrainCap;
    this.totalUsd = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.byActor = {}; // { 'nora:add-transaction': { usd, input, output, turns } }
  }

  record(actor, model, inputTokens, outputTokens) {
    const cost = tokensCost(model, inputTokens, outputTokens);
    this.totalUsd += cost;
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    if (!this.byActor[actor]) this.byActor[actor] = { usd: 0, input: 0, output: 0, turns: 0 };
    const a = this.byActor[actor];
    a.usd += cost;
    a.input += inputTokens;
    a.output += outputTokens;
    a.turns += 1;
  }

  // Throws if caps exceeded. Caller should wrap turn calls and respect the abort.
  assertWithinCaps(actor, kind /* 'persona' | 'super-brain' */) {
    if (this.totalUsd >= this.runCap) {
      throw new Error(`Run cost cap exceeded: $${this.totalUsd.toFixed(4)} / $${this.runCap}`);
    }
    const a = this.byActor[actor];
    if (a) {
      const cap = kind === 'super-brain' ? this.superBrainCap : this.personaCap;
      if (a.usd >= cap) {
        throw new Error(`${kind} cap exceeded for "${actor}": $${a.usd.toFixed(4)} / $${cap}`);
      }
    }
  }

  summary() {
    return {
      totalUsd: parseFloat(this.totalUsd.toFixed(4)),
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      byActor: Object.fromEntries(
        Object.entries(this.byActor).map(([k, v]) => [k, {
          usd: parseFloat(v.usd.toFixed(4)),
          input: v.input,
          output: v.output,
          turns: v.turns,
        }])
      ),
    };
  }
}

module.exports = { CostTracker };
