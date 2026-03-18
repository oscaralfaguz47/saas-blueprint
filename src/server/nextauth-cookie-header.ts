import { AsyncLocalStorage } from "node:async_hooks";

/**
 * NextAuth v4 runs callbacks outside Next.js App Router async context, so
 * `cookies()` from next/headers is empty. The [...nextauth] route wraps the
 * handler with this store so auth callbacks can read the raw Cookie header.
 */
const cookieHeaderAls = new AsyncLocalStorage<string>();

export function runWithNextAuthCookieHeader<T>(cookieHeader: string, fn: () => T): T {
  return cookieHeaderAls.run(cookieHeader, fn);
}

/** Use for async handlers so the store survives `await` inside NextAuth. */
export function runWithNextAuthCookieHeaderAsync<T>(
  cookieHeader: string,
  fn: () => Promise<T>
): Promise<T> {
  return cookieHeaderAls.run(cookieHeader, fn);
}

export function getNextAuthCookieHeader(): string {
  return cookieHeaderAls.getStore() ?? "";
}
