/**
 * Lets `node --test` import app modules from `src/` as Vite would:
 * `@/…` → `src/…`, extensionless `.ts` specifiers, and
 * `@tanstack/react-start/server-only` (a bundler marker) as an empty module.
 *
 *   node --experimental-transform-types --import ./tests/support/register.mjs --test …
 */
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
