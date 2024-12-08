// deno-lint-ignore-file no-explicit-any

import { withTimeout } from "./utils/with-timeout.ts";

/** Actual middleware function type */
export type MidwareUseFn<T extends unknown[]> = {
	(...args: T): any;
	/** If pre execute sorting is enabled, will sort each middleware based on this number. */
	__midwarePreExecuteSortOrder?: number;
	/** If truthy, this fn will never be found as duplicate. */
	__midwareDuplicable?: boolean;
};

/** Midware constructor options */
export interface MidwareOptions {
	/** If enabled, will sort the internal #midwares stack before executing */
	preExecuteSortEnabled?: boolean;
	/** If enabled will throw if already existing middleware is being added again. */
	duplicatesCheckEnabled?: boolean;
}

/**
 * Middleware framework manager.
 */
export class Midware<T extends unknown[]> {
	/** Internal middleware collection */
	#midwares: MidwareUseFn<T>[] = [];

	/** Inital options default values. */
	options: MidwareOptions = {
		preExecuteSortEnabled: false,
		duplicatesCheckEnabled: false,
	};

	/** Pass in array of middlewares to initialize immediately. */
	constructor(midwares: MidwareUseFn<T>[] = [], options?: MidwareOptions) {
		this.options = { ...this.options, ...(options || {}) };
		midwares.forEach((fn) => this.use(fn));
	}

	/** Internal DRY helper */
	#assertValidMidware(midware: any) {
		if (typeof midware !== "function") {
			throw new TypeError(`Middleware parameter must be a function`);
		}
	}

	/** Wraps middleware in a timeout aware promise if positive `timeout` provided.  */
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
	 * If option `dupesCheckEnabled` enabled will assert that middleware does not exist.
	 *
	 * Important: if the middleware was just wrapped in `withTimeout`
	 * the duplicity will not be detectable as it has just been created as a new function.
	 */
	#maybeDupesAssert(midware: MidwareUseFn<T>): MidwareUseFn<T> {
		// maybe return early if nothing to do here
		if (midware.__midwareDuplicable || !this.options.duplicatesCheckEnabled) {
			return midware;
		}
		//
		if (this.#midwares.includes(midware)) {
			throw new Error(
				[
					"Midware already exist (if this is OK, mark the fn as `__midwareDuplicable`",
					"or disable the `duplicatesCheckEnabled` option)",
				].join(" ")
			);
		}
		//
		return midware;
	}

	/** If truthy option `preExecuteSortEnabled` will sort the internal stack. */
	#maybePreExecuteSort() {
		if (this.options.preExecuteSortEnabled) {
			this.#midwares.sort((a, b) => {
				return (
					(a.__midwarePreExecuteSortOrder ?? Infinity) -
					(b.__midwarePreExecuteSortOrder ?? Infinity)
				);
			});
		}
	}

	/**
	 * Registers middleware function by pushing it into the internal stack.
	 *
	 * Positive non-zero parameter `timeout` will be used as this middleware execution
	 * duration check.
	 */
	use(midware: MidwareUseFn<T>, timeout: number = 0) {
		this.#assertValidMidware(midware);
		this.#midwares.push(
			this.#maybeDupesAssert(this.#maybeWithTimeout(midware, timeout))
		);
	}

	/**
	 * Similar to `use` but will unshift it to the internal stack.
	 *
	 * Positive non-zero parameter `timeout` will be used as this middleware execution
	 * duration check.
	 */
	unshift(midware: MidwareUseFn<T>, timeout: number = 0) {
		this.#assertValidMidware(midware);
		this.#midwares.unshift(
			this.#maybeDupesAssert(this.#maybeWithTimeout(midware, timeout))
		);
	}

	/**
	 * Main execution flow. Will process all middlewares in series. Each middleware
	 * function is executed with the provided `args`.
	 *
	 * Positive non-zero parameter `timeout` will be used as a total execution duration check.
	 *
	 * Execution can be terminated by returning anything other than `undefined`
	 * from any middleware function. Otherwise, middlewares are not expected to return any
	 * defined values.
	 */
	async execute(args: T, timeout: number = 0): Promise<unknown> {
		if (!Array.isArray(args)) {
			args = [args] as any;
		}

		this.#maybePreExecuteSort();

		// process all in series (for the potential timeout race, need to wrap as a single promise)
		let _exec = async () => {
			let result;
			for (const midware of this.#midwares) {
				result = await midware(...args);
				// anything other than `undefined` is considered as a termination signal
				if (result !== undefined) {
					return result;
				}
			}
			return result;
		};

		// maybe total execution timeout check...
		if (timeout > 0) {
			_exec = withTimeout(_exec, timeout, "Execution timed out");
		}

		// finally, do the work...
		return await _exec();
	}
}
