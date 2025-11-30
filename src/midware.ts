import { withTimeout } from "./utils/with-timeout.ts";

/**
 * The middleware function type that can be registered with the Midware manager.
 *
 * A middleware function receives arguments of type `T` and can return any value.
 * Returning `undefined` allows the execution chain to continue, while returning
 * any other value terminates the execution and returns that value.
 *
 * @template T - Tuple type representing the arguments passed to the middleware
 *
 * @example
 * ```ts
 * // Simple logging middleware
 * const logger: MidwareUseFn<[Request, Response]> = (req, res) => {
 *   console.log(`${req.method} ${req.url}`);
 *   // returns undefined, so execution continues
 * };
 * ```
 *
 * @example
 * ```ts
 * // Middleware with priority sorting
 * const authMiddleware: MidwareUseFn<[Request]> = (req) => {
 *   if (!req.headers.authorization) {
 *     return { error: "Unauthorized" }; // terminates execution
 *   }
 * };
 * authMiddleware.__midwarePreExecuteSortOrder = 1; // runs first
 * ```
 */
export type MidwareUseFn<T extends unknown[]> = {
	(...args: T): any;
	/**
	 * Priority order for pre-execution sorting. Lower numbers execute first.
	 * Middlewares without this property are sorted to the end (treated as Infinity).
	 * Only used when `preExecuteSortEnabled` option is true.
	 */
	__midwarePreExecuteSortOrder?: number;
	/**
	 * When true, this middleware can be added multiple times without triggering
	 * a duplicate error (when `duplicatesCheckEnabled` is true).
	 */
	__midwareDuplicable?: boolean;
};

/**
 * Configuration options for the Midware manager.
 *
 * @example
 * ```ts
 * const midware = new Midware([], {
 *   preExecuteSortEnabled: true,
 *   duplicatesCheckEnabled: true,
 * });
 * ```
 */
export interface MidwareOptions {
	/**
	 * When enabled, middlewares are sorted by `__midwarePreExecuteSortOrder` before execution.
	 * Lower numbers execute first. Middlewares without a sort order are placed at the end.
	 * The sorted order is cached and only recalculated when the middleware stack changes.
	 * @default false
	 */
	preExecuteSortEnabled?: boolean;
	/**
	 * When enabled, throws an error if the same middleware function is added twice.
	 * Individual middlewares can opt-out by setting `__midwareDuplicable = true`.
	 * Note: Middlewares wrapped with `withTimeout` create new function references,
	 * so duplicate detection won't work for those.
	 * @default false
	 */
	duplicatesCheckEnabled?: boolean;
}

/**
 * A flexible middleware framework manager for executing functions in series.
 *
 * Midware allows you to register middleware functions that are executed sequentially.
 * Each middleware receives the same arguments and can optionally terminate the chain
 * by returning a non-undefined value.
 *
 * @template T - Tuple type representing the arguments passed to all middlewares
 *
 * @example
 * ```ts
 * // Basic usage
 * const midware = new Midware<[Request, Response]>();
 *
 * midware.use((req, res) => {
 *   console.log("Logging request:", req.url);
 * });
 *
 * midware.use((req, res) => {
 *   res.body = "Hello World";
 * });
 *
 * await midware.execute([request, response]);
 * ```
 *
 * @example
 * ```ts
 * // With timeout and priority sorting
 * const midware = new Midware<[Context]>([], {
 *   preExecuteSortEnabled: true,
 * });
 *
 * const auth: MidwareUseFn<[Context]> = (ctx) => {
 *   if (!ctx.user) return { error: "Unauthorized" };
 * };
 * auth.__midwarePreExecuteSortOrder = 1;
 *
 * midware.use(auth);
 * midware.use((ctx) => ctx.data = "processed");
 *
 * const result = await midware.execute([context], 5000); // 5s total timeout
 * ```
 */
export class Midware<T extends unknown[]> {
	/** Internal middleware collection */
	#midwares: MidwareUseFn<T>[] = [];

	/** Cached sorted middleware array (only used when preExecuteSortEnabled) */
	#sortedMidwares: MidwareUseFn<T>[] | null = null;

	/** Flag indicating if the middleware stack has changed since last sort */
	#isDirty: boolean = true;

	/**
	 * The current configuration options for this Midware instance.
	 * Can be modified after construction.
	 */
	options: MidwareOptions = {
		preExecuteSortEnabled: false,
		duplicatesCheckEnabled: false,
	};

	/**
	 * Creates a new Midware instance.
	 *
	 * @param midwares - Initial array of middleware functions to register
	 * @param options - Configuration options for the middleware manager
	 *
	 * @example
	 * ```ts
	 * // Empty instance
	 * const m1 = new Midware();
	 *
	 * // With initial middlewares
	 * const m2 = new Midware([fn1, fn2]);
	 *
	 * // With options
	 * const m3 = new Midware([], { duplicatesCheckEnabled: true });
	 * ```
	 */
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

	/** Invalidates the sorted cache */
	#markDirty() {
		this.#isDirty = true;
		this.#sortedMidwares = null;
	}

	/**
	 * Returns sorted middlewares if sorting is enabled, otherwise returns original array.
	 * Uses cached sorted array if available and stack hasn't changed.
	 */
	#getExecutableMiddlewares(): MidwareUseFn<T>[] {
		if (!this.options.preExecuteSortEnabled) {
			return this.#midwares;
		}

		// Return cached sorted array if available
		if (!this.#isDirty && this.#sortedMidwares !== null) {
			return this.#sortedMidwares;
		}

		// Sort and cache
		this.#sortedMidwares = [...this.#midwares].sort((a, b) => {
			return (
				(a.__midwarePreExecuteSortOrder ?? Infinity) -
				(b.__midwarePreExecuteSortOrder ?? Infinity)
			);
		});

		this.#isDirty = false;
		return this.#sortedMidwares;
	}

	/**
	 * Registers a middleware function by pushing it to the end of the internal stack.
	 *
	 * @param midware - The middleware function to register
	 * @param timeout - Optional timeout in milliseconds for this middleware's execution.
	 *   If positive, the middleware will be wrapped with timeout protection and will
	 *   throw a `TimeoutError` if execution exceeds this duration.
	 * @throws {TypeError} If midware is not a function
	 * @throws {Error} If duplicatesCheckEnabled is true and this middleware already exists
	 *
	 * @example
	 * ```ts
	 * midware.use((ctx) => {
	 *   ctx.processed = true;
	 * });
	 *
	 * // With per-middleware timeout
	 * midware.use(slowMiddleware, 1000);
	 * ```
	 */
	use(midware: MidwareUseFn<T>, timeout: number = 0): void {
		this.#assertValidMidware(midware);
		this.#midwares.push(
			this.#maybeDupesAssert(this.#maybeWithTimeout(midware, timeout))
		);
		this.#markDirty();
	}

	/**
	 * Registers a middleware function by inserting it at the beginning of the internal stack.
	 *
	 * Similar to `use`, but the middleware will be executed first (unless sorting is enabled).
	 *
	 * @param midware - The middleware function to register
	 * @param timeout - Optional timeout in milliseconds for this middleware's execution.
	 *   If positive, the middleware will be wrapped with timeout protection and will
	 *   throw a `TimeoutError` if execution exceeds this duration.
	 * @throws {TypeError} If midware is not a function
	 * @throws {Error} If duplicatesCheckEnabled is true and this middleware already exists
	 *
	 * @example
	 * ```ts
	 * // Add a middleware that should run before all others
	 * midware.unshift((ctx) => {
	 *   ctx.startTime = Date.now();
	 * });
	 * ```
	 */
	unshift(midware: MidwareUseFn<T>, timeout: number = 0): void {
		this.#assertValidMidware(midware);
		this.#midwares.unshift(
			this.#maybeDupesAssert(this.#maybeWithTimeout(midware, timeout))
		);
		this.#markDirty();
	}

	/**
	 * Removes a specific middleware from the stack.
	 *
	 * Note: If the middleware was registered with a timeout, it was wrapped in a new
	 * function, so you won't be able to remove it using the original function reference.
	 *
	 * @param midware - The middleware function to remove (must be the exact reference)
	 * @returns `true` if the middleware was found and removed, `false` otherwise
	 *
	 * @example
	 * ```ts
	 * const myMiddleware = (ctx) => { ... };
	 * midware.use(myMiddleware);
	 *
	 * // Later...
	 * midware.remove(myMiddleware); // returns true
	 * midware.remove(myMiddleware); // returns false (already removed)
	 * ```
	 */
	remove(midware: MidwareUseFn<T>): boolean {
		const index = this.#midwares.indexOf(midware);
		if (index !== -1) {
			this.#midwares.splice(index, 1);
			this.#markDirty();
			return true;
		}
		return false;
	}

	/**
	 * Removes all middlewares from the stack.
	 *
	 * @example
	 * ```ts
	 * midware.use(fn1);
	 * midware.use(fn2);
	 * midware.clear();
	 * // Stack is now empty
	 * ```
	 */
	clear(): void {
		this.#midwares = [];
		this.#markDirty();
	}

	/**
	 * Executes all registered middlewares in series.
	 *
	 * Each middleware function is called with the provided `args`. Execution continues
	 * until all middlewares have run, or until a middleware returns a non-undefined value
	 * (which terminates the chain early).
	 *
	 * If `preExecuteSortEnabled` is true, middlewares are sorted by their
	 * `__midwarePreExecuteSortOrder` property before execution.
	 *
	 * @param args - The arguments to pass to each middleware function
	 * @param timeout - Optional total execution timeout in milliseconds.
	 *   If positive, the entire execution chain must complete within this duration
	 *   or a `TimeoutError` will be thrown.
	 * @returns A promise that resolves to the return value of the terminating middleware,
	 *   or `undefined` if all middlewares completed without returning a value.
	 * @throws {TimeoutError} If the total execution time exceeds the specified timeout
	 *
	 * @example
	 * ```ts
	 * // Basic execution
	 * const result = await midware.execute([request, response]);
	 *
	 * // With total timeout
	 * const result = await midware.execute([ctx], 5000);
	 *
	 * // Early termination
	 * midware.use((ctx) => {
	 *   if (!ctx.authorized) {
	 *     return { error: "Forbidden" }; // stops execution, returns this value
	 *   }
	 * });
	 * const result = await midware.execute([ctx]); // { error: "Forbidden" }
	 * ```
	 */
	async execute(args: T, timeout: number = 0): Promise<unknown> {
		if (!Array.isArray(args)) {
			args = [args] as any;
		}

		// Get the executable middlewares (sorted if needed, cached if possible)
		const midwaresToExecute = this.#getExecutableMiddlewares();

		// process all in series (for the potential timeout race, need to wrap as a single promise)
		let _exec = async () => {
			let result;
			for (const midware of midwaresToExecute) {
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
