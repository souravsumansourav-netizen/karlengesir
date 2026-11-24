import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Helper to safely retrieve environment variables and secrets across runtimes:
 * - Node.js / Next.js: `process.env`
 * - Cloudflare Workers: `globalThis[Symbol.for("__cloudflare-context__")].env`
 * - OpenNext Cloudflare: `getCloudflareContext().env`
 *
 * Supports fallback aliases (e.g. SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, etc.).
 */
export function getEnvVar(...keys: string[]): string | undefined {
  for (const key of keys) {
    // 1. Check process.env (Node.js / Next.js / OpenNext polyfills)
    if (typeof process !== "undefined" && process.env && process.env[key]) {
      return process.env[key];
    }

    // 2. Direct read from Cloudflare context symbol on globalThis
    try {
      const cfContextSymbol = Symbol.for("__cloudflare-context__");
      const cfContext = (globalThis as Record<string | symbol, unknown>)?.[cfContextSymbol] as
        | { env?: Record<string, unknown> }
        | undefined;
      if (cfContext?.env && typeof cfContext.env[key] === "string" && (cfContext.env[key] as string).length > 0) {
        return cfContext.env[key] as string;
      }
    } catch {
      // Ignore errors when context is not yet initialized
    }

    // 3. Fallback to OpenNext getCloudflareContext helper
    try {
      const ctx = getCloudflareContext();
      if (ctx?.env && typeof (ctx.env as Record<string, unknown>)[key] === "string") {
        const val = (ctx.env as Record<string, unknown>)[key] as string;
        if (val.length > 0) {
          return val;
        }
      }
    } catch {
      // Ignore errors when context is not yet initialized
    }
  }

  return undefined;
}
