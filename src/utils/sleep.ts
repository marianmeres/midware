/**
 * @module
 * Promise-based sleep utility for async/await flows.
 *
 * @example
 * ```ts
 * import { sleep } from "@marianmeres/midware";
 *
 * await sleep(100);
 * console.log("100ms later");
 * ```
 */

/**
 * Delays execution for the specified number of milliseconds.
 *
 * A simple promise-based sleep utility for async/await flows.
 *
 * @param timeout - The delay duration in milliseconds
 * @param __timeout_ref__ - Optional object to store the timer ID for external cancellation.
 *   Useful in Deno tests which require all timers to be cleared, or when the sleep
 *   might be cancelled before resolution (e.g., in a Promise.race scenario).
 *   If calling directly with `await sleep(x)`, this parameter is not needed.
 * @returns A promise that resolves after the specified delay
 *
 * @example
 * ```ts
 * // Simple usage
 * await sleep(100);
 * console.log("100ms later");
 * ```
 *
 * @example
 * ```ts
 * // Usage with timer reference for cancellation
 * const ref = { id: -1 };
 * const sleepPromise = sleep(5000, ref);
 *
 * // Cancel the sleep early
 * clearTimeout(ref.id);
 * ```
 */
export function sleep(
	timeout: number,
	__timeout_ref__: { id: number } = { id: -1 },
): Promise<void> {
	return new Promise((resolve) => {
		__timeout_ref__.id = setTimeout(() => {
			clearTimeout(__timeout_ref__.id);
			resolve(undefined);
		}, timeout);
	});
}
