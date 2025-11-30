# Claude Code Context

This file provides context for Claude Code when working with this repository.

## Quick Reference

Read `llm.txt` for comprehensive package documentation including:
- Complete public API reference
- Type definitions and signatures
- Execution behavior and patterns
- Implementation notes and gotchas

## Package Overview

`@marianmeres/midware` is a TypeScript middleware framework for serial function execution.

## Key Files

| File | Purpose |
|------|---------|
| `src/mod.ts` | Entry point, re-exports public API |
| `src/midware.ts` | Core `Midware` class, `MidwareUseFn`, `MidwareOptions` |
| `src/utils/with-timeout.ts` | `withTimeout()`, `TimeoutError` |
| `src/utils/sleep.ts` | `sleep()` utility |
| `tests/midware.test.ts` | Test suite |

## Commands

```sh
deno task test        # Run tests in watch mode
deno test             # Run tests once
deno task npm:build   # Build for npm
deno task npm:publish # Build and publish to npm
```

## Code Style

- Tabs for indentation
- Line width: 90
- No explicit-any lint rule disabled
- Private fields use # prefix

## When Modifying This Package

1. All public API should have JSDoc with `@param`, `@returns`, `@throws`, `@example`
2. Run `deno test` to verify changes
3. Update `llm.txt` if API changes
4. Update `README.md` for user-facing changes
