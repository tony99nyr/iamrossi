# How the ML Strategy Optimizer Works

## Overview

The ML strategy optimizer uses a **genetic algorithm with machine learning assistance** to find optimal trading strategy parameters. It combines:
- **Evolutionary search** (genetic algorithm) - generates and tests many configs
- **Machine learning** (TensorFlow.js) - learns patterns from test results to predict better configs

## How It Works (Step by Step)

### 1. **Initialization**
- Starts with a base configuration (your current strategy)
- Defines parameter bounds (e.g., buy threshold: 0.25-0.55)
- Sets up test periods (all backfill periods by default)

### 2. **Each Iteration (10 iterations total)**

#### Step 2a: Generate Population
- Creates 20 configs per iteration:
  - 1 config = current best (always included)
  - ~10 configs = random new configs
  - ~9 configs = mutations of the best config (small random changes)

#### Step 2b: Test All Configs
- Runs backfill tests for each config across ALL periods
- Tests run in parallel (uses all CPU cores)
- Calculates fitness score for each config:
  ```
  Score = (Return × 0.4) + (Sharpe × 0.3) + (Drawdown × 0.2) + (WinRate × 0.1)
  ```

#### Step 2c: Update Best Config
- If any config scores higher than current best, it becomes the new best
- Logs: `✅ New best score: 19.36 (Return: 36.95%, Sharpe: 0.00)`

#### Step 2d: Train ML Model (after 20+ samples)
- Converts configs to feature vectors (11 numbers representing all parameters)
- Trains a neural network to predict: `config → expected score`
- Model learns: "Configs with these parameter values tend to score higher"

#### Step 2e: ML Suggests New Config
- Generates 50 candidate configs
- Uses trained model to predict which candidate will score highest
- Tests the ML-suggested config
- If it beats the best, it becomes the new best

### 3. **Output**
- Saves the best config found to: `data/optimized-configs/ml-optimized-{asset}-{date}.json`
- This is a complete strategy configuration you can use

## Does It Output a New Strategy Config?

**Yes!** The optimizer outputs a complete strategy configuration JSON file:

```json
{
  "bullishStrategy": {
    "buyThreshold": 0.41,
    "sellThreshold": -0.45,
    "maxPositionPct": 0.90,
    ...
  },
  "bearishStrategy": {
    "buyThreshold": 0.65,
    "sellThreshold": -0.25,
    "maxPositionPct": 0.30,
    ...
  },
  "regimeConfidenceThreshold": 0.22,
  "kellyCriterion": {
    "fractionalMultiplier": 0.25,
    ...
  },
  "stopLoss": {
    "atrMultiplier": 2.0,
    ...
  }
}
```

You can:
1. Review the config in the JSON file
2. Manually apply it to your strategy
3. Use it in backfill tests to verify performance
4. Deploy it to paper trading

## Does the Model "Remember" Between Runs?

**No, each run starts fresh.** However:

### Within a Single Run:
- ✅ **The model learns and improves** over iterations
- ✅ Training data accumulates: iteration 1 has 20 samples, iteration 2 has 40, etc.
- ✅ The model gets better at predicting good configs as it sees more data
- ✅ The best config is tracked and improved upon

### Between Runs:
- ❌ **Each run starts from scratch** - no memory of previous runs
- ❌ The model is recreated each time
- ❌ Training data starts empty each run

### Why This Design?

1. **Fresh start each time** - Prevents overfitting to specific market conditions
2. **Robustness** - Each run tests across ALL periods, ensuring the config works in various conditions
3. **Simplicity** - No need to manage persistent model state
4. **Reproducibility** - Same input = same output (with some randomness in config generation)

## How to Make It "Remember" (Future Enhancement)

If you want the model to learn across runs, you could:

1. **Save training data** after each run
2. **Load previous training data** at the start of a new run
3. **Continue training** the model with accumulated data

However, this could lead to:
- Overfitting to historical data
- Model becoming too specialized
- Need for model versioning and management

## Current Approach Benefits

The current "fresh start" approach is actually beneficial because:

1. **Robustness** - Each run finds configs that work across diverse conditions
2. **No drift** - Model doesn't accumulate biases over time
3. **Reproducibility** - Easier to verify and compare results
4. **Simplicity** - No complex state management

## Example Run Flow

```
Iteration 1:
  - Test 20 random configs
  - Best score: 15.2
  - Train model on 20 samples
  - ML suggests config → score: 16.1 ✅ (new best!)

Iteration 2:
  - Test 20 configs (1 best + 9 random + 10 mutations)
  - Best score: 17.5 ✅ (improved!)
  - Train model on 40 samples (accumulated)
  - ML suggests config → score: 18.3 ✅ (new best!)

Iteration 3:
  - Test 20 configs (1 best + mutations)
  - Best score: 19.1 ✅
  - Train model on 60 samples
  - ML suggests config → score: 19.6 ✅

... continues for 10 iterations ...

Final: Best config saved with score 19.6
```

## Summary

- ✅ **Outputs**: Complete strategy config JSON file
- ✅ **Within run**: Model learns and improves over iterations
- ❌ **Between runs**: Each run starts fresh (by design)
- 🎯 **Result**: Optimized config tested across all market conditions

The optimizer is designed to find robust configurations that work well across diverse market conditions, not to accumulate knowledge over multiple runs.

