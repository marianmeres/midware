// deno-lint-ignore-file no-explicit-any

/**
 * @module
 * Timeout utilities for wrapping functions with execution time limits.
 *
 * Provides {@linkcode withTimeout} for wrapping any function with timeout protection,
 * and {@linkcode TimeoutError} for identifying timeout-related failures.
 *
 * @example
 * ```ts
 * import { withTimeout, TimeoutError } from "@marianmeres/midware";
 *
 * const safeFetch = withTimeout(fetch, 5000, "Request timed out");
 * try {
 *   await safeFetch("https://api.example.com");
 * } catch (e) {
 *   if (e instanceof TimeoutError) console.log("Timed out!");
 * }
 * ```
 */

/**
 * Custom error thrown when a timeout occurs during function execution.
 *
 * @example
 * ```ts
 * try {
 *   await withTimeout(someFn, 100)();
 * } catch (e) {
 *   if (e instanceof TimeoutError) {
 *     console.log("Operation timed out");
 *   }
 * }
 * ```
 */
export class TimeoutError extends Error {
	override name = "TimeoutError";
}

/**
 * Creates a new function which returns the promise-wrapped `fn`, which will
 * reject if the execution duration is longer than the provided `timeout`.
 *
 * Useful for wrapping async operations that might hang indefinitely.
 *
 * Important:
 * - A non-positive `timeout` (<= 0) is treated as "no timeout": `fn` is still
 *   promise-wrapped for signature consistency, but no timer is scheduled.
 * - A synchronous throw inside `fn` is converted into a rejected Promise.
 * - The underlying operation is **not** cancelled when the timeout fires
 *   (JavaScript has no generic way to cancel arbitrary work). Prefer passing
 *   an {@linkcode AbortSignal} from the outside if you need true cancellation.
 *
 * @template TArgs - The argument tuple of the wrapped function
 * @template TReturn - The resolved value type of the wrapped function
 * @param fn - The function to wrap with timeout protection
 * @param timeout - Maximum execution time in milliseconds (default: 1000).
 *   Values `<= 0` mean "no timeout".
 * @param errMessage - Custom error message for timeout (default: "Timed out after {timeout} ms")
 * @returns A new function returning a Promise that rejects with {@linkcode TimeoutError}
 *   if the timeout is exceeded.
 *
 * @example
 * ```ts
 * const fetchWithTimeout = withTimeout(fetch, 5000, "Request timed out");
 * const response = await fetchWithTimeout("https://api.example.com/data");
 * ```
 *
 * @example
 * ```ts
 * // Wrap an existing async function
 * async function slowOperation() {
 *   await sleep(2000);
 *   return "done";
 * }
 * const fastOperation = withTimeout(slowOperation, 100);
 * await fastOperation(); // throws TimeoutError
 * ```
 */
export function withTimeout<
	TReturn = unknown,
	TArgs extends readonly unknown[] = any[],
>(
	fn: (...args: TArgs) => TReturn | Promise<TReturn>,
	timeout: number = 1_000,
	errMessage?: string,
): (...args: TArgs) => Promise<TReturn> {
	// non-positive timeout is a no-op — just promise-wrap for signature consistency
	// (async so sync throws become rejections)
	if (!(timeout > 0)) {
		return async (...args: TArgs): Promise<TReturn> => await fn(...args);
	}

	return async (...args: TArgs): Promise<TReturn> => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const clock = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new TimeoutError(errMessage || `Timed out after ${timeout} ms`));
			}, timeout);
		});

		try {
			// wrapping `fn(...)` in Promise.resolve ensures a synchronous throw
			// becomes a rejection (Promise.race needs promises)
			return await Promise.race([Promise.resolve(fn(...args)), clock]);
		} finally {
			clearTimeout(timeoutId);
		}
	};
}
