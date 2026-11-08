# WHISKAY Command Recommendation Engine

The `.menu` Single Select recommendations are calculated from the live plugin registry plus locally stored command-use observations. The engine is deterministic for a given usage state; it is not a random shuffle and it does not imply that a percentage is a probability of success.

## Data collected

`data/command-usage.json` stores, per canonical command name:
- lifetime invocation count (`hits`);
- up to 30 recent timestamps, used to derive a seven-day count;
- last invocation time;
- number of times the command has been displayed as a recommendation;
- last recommendation exposure time.

The file is written atomically with private `0600` permissions. It is runtime data and is excluded from source ZIPs. The command name is stored, not message body, user text, or API payload.

## Ranking formula

For a command with lifetime hits `h`, seven-day hits `r`, hours since last use `u`, hours since last recommendation `e`, and exposure count `x`:

```text
demand       = 0.52 × ln(1 + h) + 0.95 × ln(1 + r)
exploration  = 2.05 / sqrt(1 + h)
freshness    = min(0.75, u / 96 × 0.75)
recentPenalty = 1.4 × exp(-u / 18)
exposurePenalty = 1.05 × exp(-e / 72) × ln(1 + x)
baseScore    = clamp(1 + demand + exploration + freshness
                     - recentPenalty - exposurePenalty, 0.05, 12)
```

The list selector first adjusts the base score for category repetition (`score / (1 + 0.7 × itemsAlreadySelectedInCategory)`) to balance recommendations across categories. For a ten-item list, two positions are reserved for discovery. Discovery priority increases when a command has fewer lifetime hits, has not been used recently, has not been shown recently, and has fewer total recommendation exposures. The tie-break is the command name, not randomness.

Finally, each displayed item gets a `recommendationPercent` equal to its adjusted score divided by the sum of adjusted scores in this displayed set. These percentages add to 100% (subject to formatting rounding); they are relative recommendation shares, not hit percentages or predicted engagement rates.

## Where the engine is used

- `.menu`: exactly ten command rows beside hit count and recommendation percentage.
- `.waform mixed` and `.waform list`: ten live recommendations.
- `.plugins`: a separate complete, paginated command directory, not a ranked recommendation list.

The algorithm filters commands from the active registry and uses `recordHit` after a recognized command completes dispatch. Built-in `.menu`, `.help`, and `.mode` are tracked explicitly. Recommendation exposure is recorded after a list is shown so repeated promotions rotate in subsequent rankings.

## Diagnostics and reset

The file can be inspected locally. Do not edit while WHISKAY is running; runtime writes are serialized and atomic. To reset the history, stop WHISKAY and move `data/command-usage.json` outside the project, then restart. This resets recommendation history only; it does not delete campaign/session data.
