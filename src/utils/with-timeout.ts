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
export class TimeoutError extends Error {}

/**
 * Creates a new function which returns the promise-wrapped `fn`, which will
 * reject if the execution duration is longer than the provided `timeout`.
 *
 * Useful for wrapping async operations that might hang indefinitely.
 *
 * @template T - The return type of the wrapped function
 * @param fn - The function to wrap with timeout protection
 * @param timeout - Maximum execution time in milliseconds (default: 1000)
 * @param errMessage - Custom error message for timeout (default: "Timed out after {timeout} ms")
 * @returns A new function that returns a Promise which rejects with TimeoutError if timeout is exceeded
 * @throws {TimeoutError} When the function execution exceeds the specified timeout
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
export function withTimeout<T>(
	fn: CallableFunction,
	timeout: number = 1_000,
	errMessage?: string,
): (...args: any[]) => Promise<T> {
	return (...args: any[]) => {
		const _promise = fn(...args);

		let _timeoutId: number;
		const _clock = new Promise((_, reject) => {
			_timeoutId = setTimeout(() => {
				reject(new TimeoutError(errMessage || `Timed out after ${timeout} ms`));
			}, timeout);
		});

		return new Promise<T>((res, rej) => {
			return Promise.race([_promise, _clock])
				.then(res)
				.catch(rej)
				.finally(() => clearTimeout(_timeoutId));
		});
	};
}
