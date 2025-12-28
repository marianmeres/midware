# Claude Code Context

## Package Overview

`@marianmeres/midware` - TypeScript middleware framework for serial function execution.

**Version:** 1.3.0 | **License:** MIT | **Runtime:** Deno, Node.js

## Quick Reference

| File | Purpose |
|------|---------|
| `src/mod.ts` | Entry point, re-exports public API |
| `src/midware.ts` | Core `Midware` class, `MidwareUseFn`, `MidwareOptions` |
| `src/utils/with-timeout.ts` | `withTimeout()`, `TimeoutError` |
| `src/utils/sleep.ts` | `sleep()` utility |
| `tests/midware.test.ts` | Test suite (11 tests) |

## Public API

```typescript
// Main class
class Midware<T extends unknown[]> {
  use(midware, timeout?): void
  unshift(midware, timeout?): void
  remove(midware): boolean
  clear(): void
  execute(args, timeout?): Promise<unknown>
}

// Utilities
withTimeout<T>(fn, timeout?, errMessage?): (...args) => Promise<T>
sleep(timeout, ref?): Promise<void>
class TimeoutError extends Error

// Types
type MidwareUseFn<T> = { (...args: T): any; __midwarePreExecuteSortOrder?: number; __midwareDuplicable?: boolean }
interface MidwareOptions { preExecuteSortEnabled?: boolean; duplicatesCheckEnabled?: boolean }
```

## Key Behaviors

- Middlewares execute sequentially (serial, not parallel)
- Return `undefined` to continue, any other value to terminate chain
- Timeout-wrapped middlewares create new function references (affects `remove()` and duplicate detection)
- Sorted order is cached until stack changes

## Commands

```sh
deno task test        # Run tests once
deno task test:watch  # Run tests in watch mode
deno task npm:build   # Build for npm
deno task npm:publish # Build and publish to npm
```

## Code Style

- Tabs for indentation, line width 90
- Private fields use `#` prefix
- All public API has JSDoc with `@param`, `@returns`, `@throws`, `@example`

## Documentation Files

- `README.md` - User guide with examples
- `API.md` - Complete API reference
- `AGENTS.md` - Machine-readable context for AI agents
- `llm.txt` - LLM context document

## When Modifying

1. Run `deno test` to verify changes
2. Update JSDoc for any API changes
3. Update `API.md` and `AGENTS.md` if public API changes
4. Update `README.md` for user-facing changes
