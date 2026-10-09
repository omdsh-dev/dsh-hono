# dsh-hono API reference

## Imports

- `defineWebServer`, `HostService`, `HostServiceInstance` from `dsh-hono`.
- Native `Hono`, `Context`, middleware from `hono` and official subpaths.
- `getServerContext`, `getServerOptions` from `dsh-hono/utils`.
- `original` from `dsh-hono/genapi`.

## `defineWebServer<Options>(setup)`

```ts
import type { Hono } from 'hono'

function defineWebServer<Options = undefined>(
  setup: (app: Hono) => void | Hono,
): HostService<Options>
```

Each activation creates a fresh Hono instance (`strict: false`). Setup must be synchronous and return nothing or the same app; invalid setup/return values throw `TypeError`. Host ownership tracking observes that supplied app; middleware ownership on `basePath()` clones is not guaranteed. Use `app.route('/prefix', child)` for prefix grouping.

```ts
const server = defineWebServer<Options>((app) => { /* register routes */ })
const dispose = server(ctx, options)
dispose() // idempotent
```

Options are optional only when `Options` is `undefined`. The host must provide `ctx.webServer.register`.

## Cordis activation

```ts
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx, options), 'plugin:routes')
}
```

The effect disposer removes this activation's registrations. Failure rolls back only this activation. `server.__host_instance` points to the most recent successful activation: disposing an older one leaves a newer one intact; disposing the current one does not restore earlier instances.

## Native routing

```ts
app.get('/api/health', c => c.json({ status: 'ok' }))
app.on(['GET', 'POST'], ['/api/a', '/api/b'], handler)
app.use('/api/*', async (c, next) => {
  await next()
  c.header('X-Plugin', 'example')
})
app.route('/api/child', child)
```

Use native `c.req.param('id')`, `c.req.query()`, `c.req.json<T>()`, `c.json(...)`, `c.text(...)`. Middleware receives `(c, next)` and awaits `next()` where appropriate. GET handles HEAD automatically; there is no `app.head`.

Do not supply Node `(req, res)` callbacks or start an adapter server. The official `@hono/node-server` adapter connects host requests internally with global object overrides disabled.

## Paths and host matching

| Hono path | Host registration |
| --- | --- |
| `/api/version` | exact `/api/version` |
| `/api/users/:id` | prefix `/api/users` |
| `/api/inspect/*` | prefix `/api/inspect` |

- Host paths must be absolute canonical pathnames without query, fragment, backslash or trailing slash (except `/`). Route declarations such as `/x/` are rejected. `strict: false` does not relax declaration validation or host exact dispatch: `/x/` does not reach a host exact `/x` route.
- Dynamic patterns infer the static prefix before the first dynamic segment; Hono matches the full pattern. A host prefix does not make every child path a match.
- Root route patterns (`/:id`, `/*`) are rejected. Global `app.use('*', ...)` middleware is not itself a host route.
- Prefixes respect segment boundaries (`/api/inspection` is outside `/api/inspect`).
- Direct parent routes retain per-group method/path ownership. A disallowed method on a matching path returns `405` with `allow`; HEAD falls back to GET. `all` and patterns cannot escape the group.
- Multiple routes in one activation may share an inferred host key; a host-owned key causes failure and rollback.
- `app.route('/mount', child)` owns the whole mount as one host prefix. Child middleware/methods/404 stay native Hono behavior, not direct-route 405 grouping. Host exact routes still win over prefix mounts.

Runtime routing is broader than GenAPI's static subset: mounted children and multiple-handler routes are not generated client contracts.

## Context helpers

```ts
import { getServerContext, getServerOptions } from 'dsh-hono/utils'

getServerContext(server) // Cordis Context
getServerContext(c) // Cordis Context of this Hono Context's activation
getServerOptions(server) // Options inferred from HostService
getServerOptions<Options>(c)
```

Helpers accept an active service or its native Hono Context. Unrelated Contexts and inactive services throw `TypeError`. Each request retains its own activation, even after a newer activation updates `server.__host_instance`.

## Security

Request generics/assertions do not validate input. Validate fields, handle invalid JSON and configure authentication/authorization/body limits for sensitive routes. Reuse native middleware such as `hono/body-limit` where applicable.
