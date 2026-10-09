---
name: dsh-hono
description: Build host-only HTTP routes for DeepSeek Harness plugins with dsh-hono, native Hono 4.13.13 and Cordis lifecycle management. Use when creating or editing DSH plugin routes on ctx.webServer with defineWebServer, reading activation Context/options with getServerContext/getServerOptions, writing native Hono Context handlers/middleware, or generating typed clients with dsh-hono/genapi.
license: MIT
compatibility: Requires Node.js, pnpm, Hono 4.13.13 and @deepseek-ai/dsh-host-webserver. The host must provide webServer before activation; the official @hono/node-server adapter is used internally.
metadata:
  author: hairyf
  version: "0.0.0"
---

# dsh-hono

Register native Hono routes on the host's **existing** `ctx.webServer`. Do not start another server, bind a port, call `serve()`, or claim the fallback slot. Cordis owns registration and disposal.

## Workflow

1. Inspect the plugin's server entry, activation and client generation config. Preserve existing transport and lifecycle contracts.
2. Declare `inject = ['webServer']` and activate a `defineWebServer` service through `ctx.effect`.
3. Write native Context handlers using `c.req` and return native responses. Use `(c, next)` for middleware.
4. Read activation dependencies through `dsh-hono/utils`, passing the Hono Context rather than the raw request.
5. For clients, keep registrations in the static subset and return a TypedResponse from `c.json(...)`.
6. Regenerate clients, build/typecheck the plugin and run repository gates. Report only checks actually run; do not commit/push unless authorized.

## Define and activate a service

```ts
// src/host/server/routes/health.ts
import type { Context } from 'hono'

export function health(c: Context) {
  return c.json({ status: 'ok' })
}
```

```ts
// src/host/server/index.ts
import { defineWebServer } from 'dsh-hono'
import { health } from './routes/health'

export interface ServerOptions { startedAt: number }

export const server = defineWebServer<ServerOptions>((app) => {
  app.get('/api/health', health)
  app.get('/api/users/:id', c => c.json({ id: c.req.param('id') }))
  app.get('/api/inspect/*', c => c.json({ path: c.req.path }))
})
```

```ts
// src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { server } from './host/server'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx, { startedAt: Date.now() }), 'hono-basic:routes')
}
```

Each activation gets a fresh native Hono instance (`strict: false`). Setup must run synchronously and return nothing or the supplied app. The disposer is idempotent; failed activation rolls back only its own registrations.

## Routes and middleware

| Declaration | Host matching |
| --- | --- |
| `app.get('/api/version', handler)` | exact `/api/version` |
| `app.get('/api/users/:id', handler)` | prefix `/api/users`; Hono parses the parameter |
| `app.get('/api/inspect/*', handler)` | prefix `/api/inspect`; Hono matches the wildcard |

Root route patterns (`/:id`, `/*`) are rejected; use a static prefix. Prefixes respect segment boundaries. Global `app.use('*', ...)` middleware creates no host route. Hono has no `app.head` registrar; GET serves HEAD automatically.

Use `app.use('/api/*', async (c, next) => { await next() })` for native middleware. Authentication, authorization and body limits are plugin responsibilities; reuse native Hono middleware rather than custom replacements.

`app.route('/mount', child)` owns the whole mount as one host prefix. Child methods and 404 behavior stay native Hono behavior. Direct parent routes have per-group `405`/`allow` ownership; host exact routes still win over prefix mounts. See [API reference](<references/api.md>) for runtime boundaries.

## Read Context and options

```ts
import type { Context } from 'hono'
import type { ServerOptions } from '../index'
import { getServerContext, getServerOptions } from 'dsh-hono/utils'

export function status(c: Context) {
  const ctx = getServerContext(c)
  const { startedAt } = getServerOptions<ServerOptions>(c)
  return c.json({ port: ctx.webServer.port, uptimeMs: Date.now() - startedAt })
}
```

The helpers also accept the service outside requests while active; options are inferred from that service. Inactive services and unrelated Hono Contexts throw `TypeError`. Each request retains its own activation's Context/options.

## Typed request and response contracts

```ts
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface Query { name?: string }
interface Body { message: string }

export async function echo(c: Context) {
  const query = c.req.query() as Query
  const body = await c.req.json<Body>().catch(() => {
    throw new HTTPException(400, { message: 'Invalid JSON' })
  })
  if (!body || typeof body.message !== 'string') {
    throw new HTTPException(400, { message: 'message must be a string' })
  }
  return c.json({ name: query.name ?? 'guest', message: body.message })
}
```

Query values are strings. `query()` does not accept an object-contract generic; use a typed assertion. JSON/query types describe contracts, not runtime validation. Validate untrusted fields before use.

GenAPI discovers one `c.req.query()` and one `c.req.json<T>()` contract per handler. Keep calls directly in the handler. Return `c.json(...)` to retain its JSON TypedResponse; do not annotate handlers as a broad `Handler` or `Response` if it erases the payload type.

## Generate and verify the client

Read [GenAPI reference](<references/genapi.md>) for pipeline setup and static boundaries. Import the stage from `dsh-hono/genapi`; it never executes host code.

- Declare `defineWebServer` directly at module scope.
- Use direct method calls, static strings/simple parameters and one handler per route.
- Terminal `/api/inspect/*` generates only the fixed `/api/inspect` client, not child paths.
- Sub-apps, loops, conditional registration, multiple-handler routes and non-JSON responses are rejected. Runtime support does not imply generator support.

```sh
pnpm exec genapi
pnpm typecheck
pnpm lint
pnpm knip
pnpm test --run
pnpm build
pnpm coverage
```

Keep generated clients in sync with handlers and inspect actual signatures before documenting calls.
