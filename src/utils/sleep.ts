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
 * Cancellation handle passed to {@linkcode sleep} to expose the underlying
 * timer id so external code can `clearTimeout(ref.id)` to cancel.
 *
 * Prefer {@linkcode AbortSignal} for new code.
 */
export interface SleepTimeoutRef {
	id: number;
}

/**
 * Delays execution for the specified number of milliseconds.
 *
 * A simple promise-based sleep utility for async/await flows.
 *
 * Cancellation may be achieved in one of two ways:
 *
 * 1. Pass an {@linkcode AbortSignal} — when aborted, the returned promise
 *    rejects with the signal's reason. **Recommended for new code.**
 * 2. Pass a `{ id: number }` ref — the underlying timer id will be written
 *    there so callers can `clearTimeout(ref.id)`. In this case, the promise
 *    resolves silently rather than rejecting (preserved for backwards
 *    compatibility with Deno-test patterns that need to clear leaked timers).
 *
 * If calling directly with `await sleep(x)`, no second argument is needed.
 *
 * @param timeout - The delay duration in milliseconds
 * @param refOrSignal - Either a `{ id: number }` ref object (legacy) or an
 *   {@linkcode AbortSignal} for cooperative cancellation.
 * @returns A promise that resolves after the specified delay, or rejects
 *   if the provided signal aborts first.
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
 * // AbortSignal cancellation (recommended)
 * const controller = new AbortController();
 * const promise = sleep(5000, controller.signal);
 * controller.abort(); // promise rejects with AbortError
 * ```
 *
 * @example
 * ```ts
 * // Legacy: timer reference for external clearTimeout
 * const ref = { id: -1 };
 * const sleepPromise = sleep(5000, ref);
 * clearTimeout(ref.id);
 * ```
 */
export function sleep(
	timeout: number,
	refOrSignal: SleepTimeoutRef | AbortSignal = { id: -1 },
): Promise<void> {
	const signal = refOrSignal instanceof AbortSignal ? refOrSignal : undefined;
	const ref = signal ? undefined : (refOrSignal as SleepTimeoutRef);

	if (signal?.aborted) {
		return Promise.reject(signal.reason);
	}

	return new Promise<void>((resolve, reject) => {
		const id = setTimeout(() => {
			if (signal) signal.removeEventListener("abort", onAbort);
			resolve();
		}, timeout);

		if (ref) ref.id = id as unknown as number;

		const onAbort = () => {
			clearTimeout(id);
			reject(signal!.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
