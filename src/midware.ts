// deno-lint-ignore-file no-explicit-any

import { withTimeout } from "./utils/with-timeout.ts";

export type MidwareUseFn<T> = (context: T) => any;

/**
 * Minimalistic middleware framework flow manager.
 *
 * @example
 *
 * ```ts
 * import { Midware } from "@marianmeres/midware";
 *
 * const app = new Midware<T>();
 *
 * app.use((context: T) => {
 * 	context.counter++;
 * 	console.log('one');
 * });
 *
 * app.use((context: T) => {
 * 	context.counter++;
 * 	console.log('two');
 * 	return Midware.TERMINATE;
 * });
 *
 * // this middleware is never reached
 * app.use((context: T) => {
 * 	context.counter++;
 * 	console.log('three');
 * });
 *
 * const result = await app.execute({ counter: 0 }); // logs "one" and "two"
 * // `result` is the provided context
 * assert(result.counter === 2);
 * ```
 */
export class Midware<T> {
	static readonly TERMINATE = Symbol("Terminate execution signal");

	#midwares: MidwareUseFn<T>[] = [];

	/** Pass in array of middleware to initialize immediately. */
	constructor(midwares: MidwareUseFn<T>[] = []) {
		midwares.forEach((fn) => this.use(fn));
	}

	#assertValidMidware(midware: any) {
		if (typeof midware !== "function") {
			throw new TypeError(`Middleware parameter must be a function`);
		}
	}

	/** Wraps middleware in timeout aware promise if positive `timeout` provided.  */
	#maybeWithTimeout(midware: MidwareUseFn<T>, timeout: number = 0) {
		if (timeout > 0) {
			midware = withTimeout<T>(
				midware,
				timeout,
				"Middleware execution timed out"
			);
		}
		return midware;
	}

	/**
	 * Registers middleware function by pushing it into the internal stack.
	 * Positive non-zero parameter `timeout` will be used as this middleware execution duration check.
	 */
	use(midware: MidwareUseFn<T>, timeout: number = 0) {
		this.#assertValidMidware(midware);
		this.#midwares.push(this.#maybeWithTimeout(midware, timeout));
	}

	/**
	 * Similar to `use` (a.k.a. push), but will unshift it to the internal stack.
	 * Positive non-zero parameter `timeout` will be used as this middleware execution duration check.
	 */
	unshift(midware: MidwareUseFn<T>, timeout: number = 0) {
		this.#assertValidMidware(midware);
		this.#midwares.unshift(this.#maybeWithTimeout(midware, timeout));
	}

	/**
	 * Main execution flow. Will process all middlewares in series. Each middleware
	 * function receives `context` as the only parameter.
	 *
	 * Positive non-zero parameter `timeout` will be used as a total execution duration check.
	 *
	 * Execution series can be terminated by returning `Midware.TERMINATE` symbol
	 * from any middleware function.
	 */
	async execute(context: T, timeout: number = 0): Promise<T> {
		// process all in series (for the potential timeout race, need to wrap as a single promise)
		let _exec = async () => {
			for (const midware of this.#midwares) {
				if ((await midware(context)) === Midware.TERMINATE) {
					break;
				}
			}
		};

		// maybe total execution timeout check...
		if (timeout > 0) {
			_exec = withTimeout(_exec, timeout, "Execution timed out");
		}

		// finally, do the work...
		await _exec();

		return context;
	}
}
