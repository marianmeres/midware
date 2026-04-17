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
	/**
	 * Internal: when a middleware is wrapped with a per-middleware timeout,
	 * the wrapper carries a back-reference to the original so that
	 * {@linkcode Midware.remove}, duplicate detection, and priority sorting
	 * all continue to see the original function.
	 *
	 * You generally should not set this manually.
	 */
	__midwareOriginal?: MidwareUseFn<T>;
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
	 * The sort is re-computed on every `execute()` call, so mutating sort-order values
	 * between runs is supported.
	 * @default false
	 */
	preExecuteSortEnabled?: boolean;
	/**
	 * When enabled, throws an error if the same middleware function is added twice.
	 * Individual middlewares can opt-out by setting `__midwareDuplicable = true`.
	 * Since v1.4, duplicate detection works correctly even for middlewares
	 * registered with a per-middleware timeout.
	 * @default false
	 */
	duplicatesCheckEnabled?: boolean;
}

/**
 * Options accepted by {@linkcode Midware.execute}.
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * await app.execute([ctx], { timeout: 5000, signal: controller.signal });
 * ```
 */
export interface MidwareExecuteOptions {
	/**
	 * Total execution timeout in milliseconds. If positive, the entire chain
	 * must complete within this duration or a {@linkcode TimeoutError} is thrown.
	 * Non-positive values mean "no timeout".
	 */
	timeout?: number;
	/**
	 * Optional AbortSignal. If the signal is aborted before or between middlewares,
	 * execution stops and the promise rejects with the signal's reason. In-flight
	 * middlewares are not forcefully cancelled; middlewares that want cooperative
	 * cancellation should read the signal from the shared context passed via `args`.
	 */
	signal?: AbortSignal;
}

/**
 * A flexible middleware framework manager for executing functions in series.
 *
 * Midware allows you to register middleware functions that are executed sequentially.
 * Each middleware receives the same arguments and can optionally terminate the chain
 * by returning a non-undefined value.
 *
 * @template T - Tuple type representing the arguments passed to all middlewares
 * @template R - Terminating-middleware return value type (defaults to `unknown`)
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
 *
 * @example
 * ```ts
 * // AbortSignal support
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 1000);
 * await midware.execute([ctx], { signal: controller.signal });
 * ```
 */
export class Midware<T extends unknown[], R = unknown> {
	/** Internal middleware collection */
	#midwares: MidwareUseFn<T>[] = [];

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

	/**
	 * The number of middlewares currently registered.
	 */
	get size(): number {
		return this.#midwares.length;
	}

	/**
	 * Read-only snapshot of the registered middlewares (unwrapped originals),
	 * in insertion order. Useful for inspection/debugging; mutating the
	 * returned array has no effect on the Midware stack.
	 */
	get middlewares(): readonly MidwareUseFn<T>[] {
		return this.#midwares.map((m) => m.__midwareOriginal ?? m);
	}

	/** Internal DRY helper */
	#assertValidMidware(midware: any) {
		if (typeof midware !== "function") {
			throw new TypeError(`Middleware parameter must be a function`);
		}
	}

	/** Returns the original (pre-timeout-wrap) function for a stored middleware. */
	#original(m: MidwareUseFn<T>): MidwareUseFn<T> {
		return m.__midwareOriginal ?? m;
	}

	/**
	 * Wraps a middleware in a timeout-aware promise if a positive `timeout` is provided.
	 * The wrapper carries a `__midwareOriginal` back-reference so that `remove`,
	 * duplicate detection, and priority sorting continue to see the original.
	 */
	#maybeWithTimeout(midware: MidwareUseFn<T>, timeout: number = 0): MidwareUseFn<T> {
		if (!(timeout > 0)) return midware;

		const wrapped = withTimeout<unknown, T>(
			midware,
			timeout,
			"Middleware execution timed out",
		) as unknown as MidwareUseFn<T>;

		wrapped.__midwareOriginal = midware;
		return wrapped;
	}

	/**
	 * If option `duplicatesCheckEnabled` is enabled, asserts that this middleware
	 * (identified by its original reference) does not already exist in the stack.
	 */
	#maybeDupesAssert(midware: MidwareUseFn<T>): MidwareUseFn<T> {
		const original = this.#original(midware);
		if (original.__midwareDuplicable || !this.options.duplicatesCheckEnabled) {
			return midware;
		}

		const exists = this.#midwares.some((m) => this.#original(m) === original);
		if (exists) {
			throw new Error(
				[
					"Midware already exist (if this is OK, mark the fn as `__midwareDuplicable`",
					"or disable the `duplicatesCheckEnabled` option)",
				].join(" "),
			);
		}

		return midware;
	}

	/**
	 * Returns sorted middlewares if sorting is enabled, otherwise the original
	 * insertion-ordered array. Sort keys are read from the original (unwrapped)
	 * function, so mutating `__midwarePreExecuteSortOrder` between `execute()`
	 * calls is honored.
	 */
	#getExecutableMiddlewares(): MidwareUseFn<T>[] {
		if (!this.options.preExecuteSortEnabled) return this.#midwares;

		return [...this.#midwares].sort((a, b) => {
			const aKey = this.#original(a).__midwarePreExecuteSortOrder ?? Infinity;
			const bKey = this.#original(b).__midwarePreExecuteSortOrder ?? Infinity;
			return aKey - bKey;
		});
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
		const wrapped = this.#maybeWithTimeout(midware, timeout);
		this.#maybeDupesAssert(wrapped);
		this.#midwares.push(wrapped);
	}

	/**
	 * Registers a middleware function by inserting it at the beginning of the internal stack.
	 *
	 * Similar to `use`, but the middleware will be executed first (unless sorting is enabled).
	 *
	 * @param midware - The middleware function to register
	 * @param timeout - Optional timeout in milliseconds for this middleware's execution.
	 * @throws {TypeError} If midware is not a function
	 * @throws {Error} If duplicatesCheckEnabled is true and this middleware already exists
	 */
	unshift(midware: MidwareUseFn<T>, timeout: number = 0): void {
		this.#assertValidMidware(midware);
		const wrapped = this.#maybeWithTimeout(midware, timeout);
		this.#maybeDupesAssert(wrapped);
		this.#midwares.unshift(wrapped);
	}

	/**
	 * Removes a specific middleware from the stack.
	 *
	 * The lookup is done against the original (unwrapped) reference, so this
	 * works correctly even when the middleware was registered with a
	 * per-middleware timeout.
	 *
	 * @param midware - The middleware function to remove (the original reference)
	 * @returns `true` if the middleware was found and removed, `false` otherwise
	 *
	 * @example
	 * ```ts
	 * const myMiddleware = (ctx) => { ... };
	 * midware.use(myMiddleware, 1000); // registered with timeout
	 *
	 * midware.remove(myMiddleware); // returns true
	 * midware.remove(myMiddleware); // returns false (already removed)
	 * ```
	 */
	remove(midware: MidwareUseFn<T>): boolean {
		const target = this.#original(midware);
		const index = this.#midwares.findIndex((m) => this.#original(m) === target);
		if (index !== -1) {
			this.#midwares.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Removes all middlewares from the stack.
	 */
	clear(): void {
		this.#midwares = [];
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
	 * @param args - The arguments to pass to each middleware function.
	 *   **Note:** For backwards compatibility, a non-array value is auto-wrapped
	 *   into a single-element array. Prefer always passing a tuple.
	 * @param timeoutOrOptions - Either a number (total timeout in ms, legacy form)
	 *   or a {@linkcode MidwareExecuteOptions} object for timeout and/or AbortSignal.
	 * @returns A promise that resolves to the return value of the terminating middleware,
	 *   or `undefined` if all middlewares completed without returning a value.
	 * @throws {TimeoutError} If the total execution time exceeds the specified timeout
	 * @throws The AbortSignal's `reason` if the signal is aborted
	 *
	 * @example
	 * ```ts
	 * // Basic execution
	 * const result = await midware.execute([request, response]);
	 *
	 * // With total timeout (legacy form)
	 * const result = await midware.execute([ctx], 5000);
	 *
	 * // With options object (timeout + AbortSignal)
	 * const ac = new AbortController();
	 * await midware.execute([ctx], { timeout: 5000, signal: ac.signal });
	 * ```
	 */
	async execute(
		args: T,
		timeoutOrOptions: number | MidwareExecuteOptions = 0,
	): Promise<R | undefined> {
		const options: MidwareExecuteOptions =
			typeof timeoutOrOptions === "number"
				? { timeout: timeoutOrOptions }
				: (timeoutOrOptions ?? {});
		const { timeout = 0, signal } = options;

		// Legacy BC: auto-wrap non-array args. Prefer passing a tuple.
		if (!Array.isArray(args)) {
			args = [args] as any;
		}

		// short-circuit if already aborted
		if (signal?.aborted) throw signal.reason;

		const midwaresToExecute = this.#getExecutableMiddlewares();

		let _exec = async (): Promise<R | undefined> => {
			let result: unknown;
			for (const midware of midwaresToExecute) {
				if (signal?.aborted) throw signal.reason;
				result = await midware(...args);
				// anything other than `undefined` is considered a termination signal
				if (result !== undefined) return result as R;
			}
			return result as R | undefined;
		};

		// optional total-execution timeout
		if (timeout > 0) {
			_exec = withTimeout(_exec, timeout, "Execution timed out");
		}

		return await _exec();
	}
}
