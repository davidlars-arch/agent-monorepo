# Usage Status Prompt

You are updating Atlas Planner usage status.

1. Do not call an LLM to estimate usage.
2. If explicit usage values are available, pass them through env vars:
   - `USAGE_STATUS_MODEL`
   - `USAGE_CONTEXT`
   - `USAGE_CURRENT_TOKENS`
   - `USAGE_SHORT_WINDOW`
   - `USAGE_WEEKLY`
   - `USAGE_NOTE`
3. Run `npm run usage:status`.
4. If the snapshot is still fresh, accept the skip instead of forcing an update.
5. Confirm `loops/usage-status/latest-status.json` exists.
6. If no live usage source exists, leave values as `unknown` and rely on Atlas Planner's conservative max-8 fallback.

Never burn model tokens for this update.
