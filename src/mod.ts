/**
 * @module
 * A minimalistic, type-safe middleware framework for executing functions in series.
 *
 * This module provides the core {@linkcode Midware} class for managing middleware
 * stacks, along with utility functions {@linkcode withTimeout} and {@linkcode sleep}
 * for timeout protection and async delays.
 *
 * @example
 * ```ts
 * import { Midware, withTimeout, sleep, TimeoutError } from "@marianmeres/midware";
 *
 * const app = new Midware<[{ user?: string }]>();
 * app.use((ctx) => { ctx.user = "john"; });
 * await app.execute([{}]);
 * ```
 */

export * from "./midware.ts";
export * from "./utils/with-timeout.ts";
export * from "./utils/sleep.ts";
