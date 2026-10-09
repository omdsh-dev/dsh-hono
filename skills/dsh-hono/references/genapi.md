# GenAPI rules

`dsh-hono/genapi` exports `original`, a static TypeScript-compiler-based stage. It loads no plugin and executes no host code: it reads routes/contracts into an OpenAPI-shaped document, then the installed pipeline emits client functions and types.

## Pipeline setup

```ts
// genapi.config.ts
import { defineConfig } from '@genapi/core'
import pipeline from '@genapi/pipeline'
import { fetch } from '@genapi/presets'
import { original } from 'dsh-hono/genapi'

export default defineConfig({
  preset: pipeline(
    fetch.ts.config,
    original,
    fetch.ts.parser,
    fetch.ts.compiler,
    fetch.ts.generate,
    fetch.ts.dest,
  ),
  input: './src/host/server/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
```

Install `@genapi/core`, `@genapi/pipeline`, `@genapi/presets` as dev dependencies; run `pnpm exec genapi`. Build the workspace library first when using its package export. Type output is required, input must be a local file, and TypeScript diagnostics from the nearest tsconfig fail generation before route collection.

## Static entry

Declare `defineWebServer(...)` directly at module scope, not inside factories/classes/conditions. Setup must be synchronous with a named app parameter.

Setup accepts direct `app.method(...)` expressions, const bindings not referencing app, a trailing return of app/a registrar chain, and empty statements. Chaining and native method/path arrays are supported:

```ts
app.get('/api/a', a).post('/api/b', b)
app.on(['GET', 'POST'], ['/api/c', '/api/d'], handler)
```

`app.use` middleware creates no client route and is skipped. `app.route`, conditional/looped registration and multiple handlers per route are unsupported. Multiple handlers are rejected, not silently reduced to a handler while losing early middleware responses.

## Paths

Supported: absolute static paths; simple unique `:parameter` segments below a static prefix; terminal `/*` after a non-root, fully static prefix.

- `/api/users/:id` generates a required string path argument.
- `/api/inspect/*` generates only the fixed `/api/inspect` client, not child paths.
- Root dynamic paths/wildcards, parameterized wildcard prefixes, other wildcard shapes, complex regex patterns, query/fragment/backslash/code delimiters are unsupported.

Runtime host matching is broader than this subset; an inferred host prefix does not imply client support.

## Native handlers

Use statically resolvable arrow/functions or function declarations taking a native Hono Context. Imported handlers resolve from source. Node callbacks, computed handlers and sub-applications are unsupported.

```ts
import type { Context } from 'hono'

interface Query { name?: string }
interface Body { message: string }

export async function echo(c: Context) {
  const query = c.req.query() as Query
  const body = await c.req.json<Body>()
  return c.json({ name: query.name ?? 'guest', message: body.message })
}
```

This snippet describes contracts, not validation. Validate untrusted values and handle invalid JSON before use.

## Request contracts

Keep reads directly in the handler body through the Context identifier (`c.req.query()` / `c.req.json<T>()`); nested functions are not traversed. Destructured Context parameters and request aliases such as `const req = c.req` are rejected to avoid silently omitting contracts, though native runtime handlers may use them. Use at most one query and one JSON body contract per handler:

- `c.req.query() as Query`: named fields become query parameters; optional properties are optional. Raw values are strings. Hono query does not accept an object-contract generic; do not pretend strings are boolean/number before validation/conversion.
- `c.req.json<Body>()`: an explicit generic or concrete inferred contract supplies an object body with named fields, not an array, primitive, tuple or string-index map.

Field-query getters do not replace the typed object contract for generation. Avoid hiding request reads inside wrappers.

## Response contracts

The stage extracts JSON payloads from TypedResponse returned by `c.json(...)`, including async handlers. Broad `Handler`/`Response` return annotations can erase the payload contract; preserve inference.

Generation keeps the existing aggregated response contract under `200`, not a complete status-code map. Middleware early responses and error-hook responses are not independently modeled. It is a static client contract, not a full OpenAPI description of every runtime response.

Concrete JSON objects, arrays, tuples and unions are supported. `Date` becomes string. Recursive types, unresolved type parameters, bigint, symbols, functions, classes and non-JSON responses are outside the subset.

## Names and calls

Names derive from method/path: `GET /api/health` yields `GetApiHealthResponse`; `/api/echo/:channel` yields `GetApiEchochannelPath` and function `getApiEchoChannel`. Normalization can collide; choose distinguishable paths. Use `patch.operations` to override function names.

Inspect the generated fetch signatures; playground calls are:

```ts
await getApiHealth()
await getApiInspect({ query: '1' })
await getApiEchoChannel({ channel: 'demo' }, { pretty: 'true', limit: '2' })
await postApiEchoChannel({ channel: 'demo' }, { message: 'hello' }, { pretty: 'false' })
```

The installed preset uses native fetch and `RequestInit`, not a `baseURL` option. Relative URLs suit same-origin clients; independent clients need an appropriate transport/origin configuration.

## Verification

Regenerate rather than hand-editing clients. Check output consistency, TypeScript, build, lint and relevant requests. Errors include `dsh-hono/genapi` and source file/line/column. Compiler diagnostics and missing static routes fail generation.

| Supported | Not supported |
| --- | --- |
| `app.get/post/put/patch/delete/options` | broad `app.all` contracts |
| Native `app.on` method/path arrays | child mounts/multiple route handlers |
| Registrar chains | conditions/loops/try/nested registration |
| Static/simple parameter paths below a prefix | root dynamic routes/complex patterns |
| Static `/api/inspect/*` → base only | parameterized/interior/root wildcards |
| typed `c.req.query()` / `c.req.json<T>()` | repeated reads/computed handlers |
| typed `c.json(...)` payloads | recursive/non-JSON responses |
