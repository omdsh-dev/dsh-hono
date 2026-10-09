import type { ApiPipeline } from '@genapi/shared'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { original } from '../src/genapi'

function scope(): ApiPipeline.GraphSlice {
  return { functions: [], imports: [], variables: [], typings: [], interfaces: [] }
}

function read(uri: string, withTypeScope = true): ApiPipeline.ConfigRead {
  const scopes: Record<string, ApiPipeline.GraphSlice> = withTypeScope ? { type: scope() } : {}
  return {
    inputs: { uri },
    config: { input: { uri } },
    graphs: { scopes, response: {} },
    outputs: [],
  }
}

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/genapi/${name}`, import.meta.url))
}

function rejects(name: string, message: RegExp): void {
  expect(() => original(read(fixture(name)))).toThrow(message)
}

function accepts(name: string): ApiPipeline.GraphSlice {
  const configRead = read(fixture(name))
  original(configRead)
  return configRead.graphs.scopes.type
}

// Static TypeScript programs are slower under V8 coverage instrumentation.
describe('genapi input and configuration failures', { timeout: 20_000 }, () => {
  it('rejects a missing service entry uri (src/genapi.ts:57-58)', () => {
    expect(() => original(read(''))).toThrow(/input must be a local service entry file/)
  })

  it('rejects a tsconfig whose root value is not an object (src/genapi.ts:64-65)', () => {
    rejects('config-not-object/entry.ts', /must be an object/)
  })

  it('rejects a tsconfig with an invalid compiler option value (src/genapi.ts:67-68)', () => {
    rejects('bad-option/entry.ts', /TS6046/)
  })

  it('rejects a service entry that cannot be read, without any tsconfig above it (src/genapi.ts:73-74)', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-hono-genapi-'))
    expect(() => original(read(join(directory, 'entry.ts')))).toThrow(/cannot read service entry/)
  })

  it('rejects a service entry with pre-emit diagnostics (src/genapi.ts:76-77)', () => {
    rejects('preemit/entry.ts', /no exported member 'defineWebServer'/)
  })

  it('requires a TypeScript type output (src/genapi.ts:80-81)', () => {
    expect(() => original(read(fixture('routes.ts'), false))).toThrow(/a TypeScript type output is required/)
  })
})

// Static TypeScript programs are slower under V8 coverage instrumentation.
describe('genapi handler and contract failures', { timeout: 20_000 }, () => {
  it('rejects a non-const route binding (src/genapi.ts:113-114)', () => {
    rejects('binding-not-const.ts', /route bindings must be const/)
  })

  it('rejects a route path that is not a static string (src/genapi.ts:126)', () => {
    rejects('path-not-static.ts', /route paths and HTTP methods must be static strings/)
  })

  it('rejects a contract with a bigint response member (src/genapi.ts:136-137)', () => {
    rejects('contract-bigint.ts', /request and response contracts must be concrete JSON types/)
  })

  it('rejects a recursive contract (src/genapi.ts:142-143)', () => {
    rejects('contract-recursive.ts', /recursive contracts are not supported/)
  })

  it('does not mistake a recursive user JSONValue for Hono JSONParsed<unknown>', () => {
    rejects('contract-jsonvalue.ts', /recursive contracts are not supported/)
  })

  it('rejects a function member in a contract (src/genapi.ts:149-150)', () => {
    rejects('contract-function.ts', /functions and class instances are not JSON contracts/)
  })

  it('rejects a computed Node-style callback wrapper (src/genapi.ts:193-195)', () => {
    rejects('handler-node-callback.ts', /use a statically resolvable Hono handler/)
  })

  it('rejects a handler without any call signature (src/genapi.ts:232-233)', () => {
    rejects('handler-not-callable.ts', /handler must be callable/)
  })

  it('rejects two contracts read from one handler (src/genapi.ts:238-239)', () => {
    rejects('request-twice.ts', /use one c\.req\.query\/c\.req\.json contract per handler/)
  })

  it('rejects c.req.json over a string contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-string.ts', /c\.req\.json requires an object contract with named fields/)
  })

  it('rejects c.req.json over an array contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-array.ts', /c\.req\.json requires an object contract with named fields/)
  })

  it('rejects c.req.json over a tuple contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-tuple.ts', /c\.req\.json requires an object contract with named fields/)
  })

  it('rejects c.req.json over an index signature contract (src/genapi.ts:253-254)', () => {
    rejects('readbody-index.ts', /c\.req\.json requires an object contract with named fields/)
  })
})

// Static TypeScript programs are slower under V8 coverage instrumentation.
describe('genapi route failures', { timeout: 20_000 }, () => {
  it('rejects a relative route path (src/genapi.ts:200-201)', () => {
    rejects('path-relative.ts', /route path must be an absolute pathname/)
  })

  it('rejects a protocol relative route path (src/genapi.ts:200-201)', () => {
    rejects('path-protocol.ts', /route path must be an absolute pathname/)
  })

  it('rejects a route path with a query delimiter (src/genapi.ts:200-201)', () => {
    rejects('path-delimiter.ts', /route path must be an absolute pathname/)
  })

  it('rejects a brace pattern before URL normalization', () => {
    rejects('path-braces.ts', /only static paths and simple :parameter segments/)
  })

  it.each(['path-wildcard.ts', 'path-wildcard-interior.ts', 'path-wildcard-root.ts', 'path-wildcard-param.ts', 'path-wildcard-trailing.ts'])('rejects an unsupported wildcard route: %s', (name) => {
    rejects(name, /only static paths and simple :parameter segments/)
  })

  it('rejects a duplicated path parameter name (src/genapi.ts:212-213)', () => {
    rejects('path-param-dup.ts', /path parameter names must be unique/)
  })

  it('rejects a malformed path parameter segment (src/genapi.ts:217-218)', () => {
    rejects('path-param-bad.ts', /only simple :parameter segments are supported/)
  })

  it('rejects a method wide route declaration (src/genapi.ts:223-224)', () => {
    rejects('method-all.ts', /declare a specific OpenAPI HTTP method/)
  })

  it('rejects a duplicated method and path declaration (src/genapi.ts:227-228)', () => {
    rejects('duplicate-route.ts', /duplicate GET \/api\/duplicate/)
  })
})

// Static TypeScript programs are slower under V8 coverage instrumentation.
describe('genapi setup failures', { timeout: 20_000 }, () => {
  it('rejects a setup callback without an app parameter (src/genapi.ts:277-278)', () => {
    rejects('setup-no-param.ts', /defineWebServer requires a static setup callback with an app parameter/)
  })

  it('rejects a setup that calls something other than app (src/genapi.ts:284-285)', () => {
    rejects('setup-foreign-call.ts', /setup must use direct app.method\(\.\.\.\) route declarations/)
  })

  it('rejects app.on without all three arguments (src/genapi.ts:293-294)', () => {
    rejects('setup-on-short.ts', /app.on requires method, path and handler/)
  })

  it('rejects a route declaration without both arguments (src/genapi.ts:298-299)', () => {
    rejects('setup-get-short.ts', /route declarations require path and handler/)
  })

  it('rejects a conditional route registration (src/genapi.ts:311-314)', () => {
    rejects('setup-conditional.ts', /conditional, looped and mounted route registration is not supported/)
  })

  it('rejects a non-const binding inside setup (src/genapi.ts:315-316)', () => {
    rejects('setup-let-binding.ts', /route bindings must be const/)
  })

  it('rejects an indirect app use inside a binding (src/genapi.ts:317-322)', () => {
    rejects('setup-indirect.ts', /setup must use direct app.method\(\.\.\.\) route declarations/)
  })

  it('rejects a service declared inside a block (src/genapi.ts:340-345)', () => {
    rejects('setup-nested-module.ts', /services must be declared directly at module scope/)
  })

  it('rejects an input without any defineWebServer route (src/genapi.ts:353-354)', () => {
    rejects('middleware-only.ts', /no static defineWebServer routes found in input/)
  })
})

// Static TypeScript programs are slower under V8 coverage instrumentation.
describe('genapi native Hono contracts', { timeout: 20_000 }, () => {
  it('rejects destructured Context instead of dropping its body contract', () => {
    rejects('request-destructured.ts', /destructured request contracts are not supported/)
  })

  it.each(['request-alias.ts', 'context-alias.ts'])('rejects aliased requests instead of dropping their contracts: %s', (name) => {
    rejects(name, /Context and request aliases are not supported/)
  })

  it.each(['response-text.ts', 'response-raw.ts', 'response-mixed.ts'])('rejects non-JSON responses instead of describing Response internals: %s', (name) => {
    rejects(name, /response must have a statically inferred JSON TypedResponse/)
  })

  it('requires named query fields instead of silently losing an untyped contract', () => {
    rejects('query-untyped.ts', /c.req.query requires a typed object contract with named fields/)
  })

  it('rejects keyed query reads', () => {
    rejects('query-keyed.ts', /not a keyed query read/)
  })

  it.each(['route-middleware.ts', 'on-middleware.ts'])('rejects extra native middleware instead of silently losing its contract: %s', (name) => {
    rejects(name, /route middleware and extra route arguments are not supported/)
  })

  it('rejects empty native method arrays', () => {
    rejects('on-empty.ts', /non-empty static methods and paths/)
  })

  it('accepts native function expressions', () => {
    expect(accepts('handler-function-expression.ts').typings[0].name).toBe('GetApiFunctionExpressionResponse')
  })

  it('supports native method/path arrays, options, HEAD, typed query and async body without executing the entry', () => {
    const configRead = read(fixture('native.ts'))
    original(configRead)
    expect(Object.keys(configRead.source.paths['/api/native-a'])).toEqual(['get', 'post'])
    expect(Object.keys(configRead.source.paths['/api/native-b'])).toEqual(['get', 'post'])
    expect(configRead.source.paths['/api/options'].options).toBeDefined()
    expect(configRead.source.paths['/api/head'].head).toBeDefined()
    expect(configRead.source.paths['/api/query'].get.parameters).toEqual([
      { $ref: '#/definitions/GetApiQueryQuerySearch', name: 'search', in: 'query', required: true },
      { $ref: '#/definitions/GetApiQueryQueryPage', name: 'page', in: 'query', required: false },
    ])
    const scope = configRead.graphs.scopes.type
    expect(scope.typings.find(typing => typing.name === 'GetApiQueryResponse')?.value).toContain('"at": string')
    expect(scope.typings.find(typing => typing.name === 'PostApiBodyResponse')?.value).toBe('{ "message": string }')
    expect(scope.typings.find(typing => typing.name === 'GetApiUnionResponse')?.value).toContain(' | ')
    expect(scope.interfaces).toContainEqual({
      name: 'PostApiBodyBody',
      export: true,
      properties: [
        { name: 'message', type: 'string', required: true },
        { name: 'tags', type: '(undefined | (string)[])', required: false },
      ],
    })
  })
})

// Static TypeScript programs are slower under V8 coverage instrumentation.
describe('genapi accepted input branches', { timeout: 20_000 }, () => {
  it('accepts native exact, static prefix and root paths', () => {
    const scope = accepts('branches-paths.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiLiteralExactResponse',
      'GetApiLiteralPrefixResponse',
      'GetResponse',
    ])
  })

  it('accepts parenthesized, asserted and native function handlers', () => {
    const scope = accepts('branches-unwrap.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiUnwrapParenthesizedResponse',
      'GetApiUnwrapAssertedResponse',
      'GetApiUnwrapSatisfiedResponse',
      'GetApiUnwrapNonNullResponse',
      'GetApiUnwrapTypeAssertionResponse',
      'GetApiUnwrapObjectFormResponse',
    ])
  })

  it('accepts every supported contract shape', () => {
    const scope = accepts('branches-types.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual(['GetApiTypesResponse'])
  })

  it('accepts chained, concise and returning setups', () => {
    const scope = accepts('branches-routing.ts')
    expect(scope.typings.map(typing => typing.name)).toContain('GetApiChainBResponse')
  })

  it('accepts an object contract for c.req.json and skips nested handlers', () => {
    const scope = accepts('branches-readbody.ts')
    expect(scope.interfaces.map(typing => typing.name)).toEqual(['PostApiReadbodyObjectBody'])
  })

  it('accepts aliased, functional and default exported handlers', () => {
    const scope = accepts('branches-imports.ts')
    expect(scope.typings.map(typing => typing.name)).toEqual([
      'GetApiImportedNamedResponse',
      'GetApiImportedFunctionResponse',
      'GetApiImportedDefaultResponse',
    ])
  })
})
