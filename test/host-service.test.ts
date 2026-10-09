import type { HttpBindings } from '@hono/node-server'
import { Buffer } from 'node:buffer'
import { request } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { Hono, Context as HonoContext } from 'hono'
import { streamSSE } from 'hono/streaming'
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineWebServer } from '../src'
import { getServerContext, getServerOptions } from '../src/utils'

declare module 'hono' {
  interface ContextVariableMap {
    marker: string
    child: boolean
    local: boolean
  }
}

describe('host service', () => {
  const ctx = new Context()
  const disposers: Array<() => void | Promise<void>> = []
  let base: string

  beforeAll(async () => {
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'gzip', compressionThresholdBytes: 1024 })
    base = `http://127.0.0.1:${ctx.webServer.port}`
  })
  afterEach(async () => {
    for (const dispose of disposers.splice(0).reverse())
      await dispose()
  })
  afterAll(async () => {
    await ctx.fiber.dispose()
  })

  it('runs native handlers through WebServer and a labeled Cordis effect', async () => {
    const requestClass = globalThis.Request
    const responseClass = globalThis.Response
    const service = defineWebServer((app) => {
      expect(app).toBeInstanceOf(Hono)
      expectTypeOf(app).toEqualTypeOf<Hono>()
      app.use(async (c, next) => {
        c.set('marker', 'seen')
        await next()
      })
      app.post('/hello', c => c.text('posted'))
      app.get('/hello', c => c.json({ method: c.req.method }))
      app.post('/aaa', async c => c.json({ body: await c.req.json(), middleware: c.get('marker') }))
      app.post('/bbb/*', c => c.text(new URL(c.req.url).pathname + new URL(c.req.url).search))
    })
    const register = vi.spyOn(ctx.webServer, 'register')
    const dispose = ctx.effect(() => service(ctx), 'custom-label')
    disposers.push(dispose)
    expect(register).toHaveBeenCalledTimes(3)
    expect(globalThis.Request).toBe(requestClass)
    expect(globalThis.Response).toBe(responseClass)
    register.mockRestore()
    expect(await (await fetch(`${base}/hello`)).json()).toEqual({ method: 'GET' })
    expect(await (await fetch(`${base}/hello`, { method: 'POST' })).text()).toBe('posted')
    expect(await (await fetch(`${base}/aaa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 42 }) })).json()).toEqual({ body: { value: 42 }, middleware: 'seen' })
    for (const path of ['/bbb', '/bbb/child?query=1'])
      expect(await (await fetch(`${base}${path}`, { method: 'POST' })).text()).toBe(path)
    expect((await fetch(`${base}/bbbb`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/aaa/child`, { method: 'POST' })).status).toBe(404)
    const head = await fetch(`${base}/hello`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    const wrongMethod = await fetch(`${base}/hello`, { method: 'PUT' })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST, GET, HEAD')
    await dispose()
    expect((await fetch(`${base}/hello`)).status).toBe(404)
    disposers.push(defineWebServer(app => app.get('/hello', c => c.text('replacement')))(ctx))
    await dispose()
    expect(await (await fetch(`${base}/hello`)).text()).toBe('replacement')
  })

  it('binds context/options to each activation and clears disposed instances', async () => {
    interface Options { name: string }
    const first = { name: 'first' }
    const second = { name: 'second' }
    const capturedContexts: Context[] = []
    const capturedOptions: Options[] = []
    const service = defineWebServer<Options>((app) => {
      app.use(async (c, next) => {
        capturedContexts.push(getServerContext(c))
        await next()
      })
      app.route('/instance', new Hono().get('/', (c) => {
        const options = getServerOptions<Options>(c)
        capturedOptions.push(options)
        return c.json({ name: options.name, port: getServerContext(c).webServer.port })
      }))
    })
    expect(() => getServerContext(service)).toThrow('service is not active')
    expect(() => getServerOptions(service)).toThrow('service is not active')
    const foreign = new HonoContext(new Request('http://localhost/instance'))
    expect(() => getServerContext(foreign)).toThrow('context does not belong')
    expect(() => getServerOptions(foreign)).toThrow('context does not belong')
    const disposeFirst = service(ctx, first)
    disposers.push(disposeFirst)
    const firstInstance = service.__host_instance
    expect(getServerContext(service)).toBe(ctx)
    expectTypeOf(getServerContext(service)).toEqualTypeOf<Context>()
    expectTypeOf(getServerContext<Context & { custom: string }>(service)).toEqualTypeOf<Context & { custom: string }>()
    expect(getServerContext<Context & { custom: string }>(service)).toBe(ctx)
    expect(getServerOptions(service)).toBe(first)
    expectTypeOf(getServerOptions(service)).toEqualTypeOf<Options>()
    expect(() => service(ctx, second)).toThrow('duplicate prefix route')
    expect(service.__host_instance).toBe(firstInstance)
    const other = new Context()
    disposers.push(() => other.fiber.dispose())
    await other.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const disposeSecond = service(other, second)
    disposers.push(disposeSecond)
    expect(getServerContext(service)).toBe(other)
    expect(getServerOptions(service)).toBe(second)
    expect(await (await fetch(`${base}/instance`)).json()).toEqual({ name: 'first', port: ctx.webServer.port })
    expect(await (await fetch(`http://127.0.0.1:${other.webServer.port}/instance`)).json()).toEqual({ name: 'second', port: other.webServer.port })
    expect(capturedContexts).toEqual([ctx, other])
    expect(capturedOptions[0]).toBe(first)
    expect(capturedOptions[1]).toBe(second)
    expect((await fetch(`${base}/instance`, { method: 'POST' })).status).toBe(404)
    disposeFirst()
    expect(getServerContext(service)).toBe(other)
    disposeSecond()
    expect(service.__host_instance).toBeUndefined()
    expect(() => getServerOptions(service)).toThrow('service is not active')
    disposers.push(service(ctx, first))
    expect(getServerContext(service)).toBe(ctx)
    expect(getServerOptions(service)).toBe(first)
  })

  it('supports services without options', async () => {
    const service = defineWebServer(app => app.get('/no-options', (c) => {
      expect(getServerOptions(c)).toBeUndefined()
      expect(getServerContext(c)).toBe(ctx)
      expectTypeOf(getServerContext<Context & { custom: string }>(c)).toEqualTypeOf<Context & { custom: string }>()
      return c.json({ ok: true })
    }))
    disposers.push(service(ctx))
    expect(getServerOptions(service)).toBeUndefined()
    expectTypeOf(getServerOptions(service)).toEqualTypeOf<undefined>()
    expect(await (await fetch(`${base}/no-options`)).json()).toEqual({ ok: true })
  })

  it('keeps exact and longest-prefix method ownership', async () => {
    disposers.push(defineWebServer((app) => {
      app.post('/scope/*', c => c.text('outer'))
      app.get('/scope/nested/*', c => c.text('inner'))
      app.get('/scope/exact', c => c.text('exact'))
    })(ctx))
    expect(await (await fetch(`${base}/scope/nested/child`)).text()).toBe('inner')
    expect((await fetch(`${base}/scope/nested/child`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${base}/scope/exact`, { method: 'POST' })).status).toBe(405)
  })

  it('keeps native HEAD and all-method fallbacks within the selected group', async () => {
    const outer = vi.fn((c: HonoContext) => c.text('outer'))
    const exact = vi.fn((c: HonoContext) => c.text('exact'))
    disposers.push(defineWebServer((app) => {
      app.on('HEAD', '/ownership/*', outer)
      app.get('/ownership/exact', exact)
      app.get('/ownership/nested/*', exact)
      app.all('/all-methods/*', outer)
      app.get('/all-methods/exact', exact)
      app.get('/', c => c.text('root'))
    })(ctx))
    for (const path of ['/ownership/exact', '/ownership/nested/child'])
      expect((await fetch(`${base}${path}`, { method: 'HEAD' })).status).toBe(200)
    expect((await fetch(`${base}/ownership/child`, { method: 'HEAD' })).status).toBe(405)
    expect((await fetch(`${base}/all-methods/exact`, { method: 'POST' })).status).toBe(405)
    expect(await (await fetch(`${base}/`)).text()).toBe('root')
    expect(exact).toHaveBeenCalledTimes(2)
    expect(outer).not.toHaveBeenCalled()
    expect(await (await fetch(`${base}/all-methods/child`, { method: 'POST' })).text()).toBe('outer')
  })

  it('preserves middleware, native patterns, mounted apps and chaining', async () => {
    let captured: Hono | undefined
    const child = new Hono()
    child.use(async (c, next) => {
      c.set('child', true)
      await next()
    })
    child.get('/', c => c.text('child root'))
    child.get('/child', c => c.json({ marker: c.get('marker'), child: c.get('child') }))
    disposers.push(defineWebServer((app) => {
      captured = app
      app.use(async (c, next) => {
        c.set('marker', 'native')
        await next()
      })
      app.use('/users/*', async (c, next) => {
        c.set('local', true)
        await next()
      })
      app.route('/mounted', child)
      expect(app.get('/users/:id', c => c.json({ id: c.req.param('id'), middleware: c.get('local') }))).toBe(app)
      app.get('/files/*', c => c.text(new URL(c.req.url).pathname))
      app.get('/inline/:id{[0-9]+}', c => c.text(c.req.param('id')))
      app.on('GET', '/trailing', c => c.text('trailing'))
      app.get('/路径', c => c.text('unicode'))
      app.get('/encoded/%2F', c => c.text('encoded separator'))
      app.get('/separator/:id', c => c.text(c.req.param('id')))
    })(ctx))
    expect(await (await fetch(`${base}/mounted`)).text()).toBe('child root')
    expect(await (await fetch(`${base}/mounted/child`)).json()).toEqual({ marker: 'native', child: true })
    expect(await (await fetch(`${base}/inline/456`)).text()).toBe('456')
    expect(await (await fetch(`${base}/users/123`)).json()).toEqual({ id: '123', middleware: true })
    expect(await (await fetch(`${base}/files/a/b`)).text()).toBe('/files/a/b')
    expect(await (await fetch(`${base}/trailing`)).text()).toBe('trailing')
    expect(await (await captured!.request('/trailing/')).text()).toBe('trailing')
    expect(await (await fetch(`${base}/路径`)).text()).toBe('unicode')
    expect(await (await fetch(`${base}/%E8%B7%AF%E5%BE%84`)).text()).toBe('unicode')
    expect(await (await fetch(`${base}/encoded/%2F`)).text()).toBe('encoded separator')
    expect(await (await fetch(`${base}/separator/a%2Fb`)).text()).toBe('a/b')
    expect((await fetch(`${base}/separator/a/b`)).status).toBe(404)
    expect(await (await captured!.request('/users/direct')).json()).toEqual({ id: 'direct', middleware: true })
  })

  it('preserves native error/notFound and mounted ownership without outer fallback leakage', async () => {
    const child = new Hono()
    child.onError((err, c) => c.json({ error: err.message }, 422))
    child.use(async (c, next) => {
      if (c.req.path.endsWith('/early'))
        return c.text('early')
      await next()
      c.header('x-child', 'seen')
    })
    child.get('/fail', () => {
      throw new Error('child')
    })
    disposers.push(defineWebServer((app) => {
      app.onError((err, c) => c.text(err.message, 503))
      app.notFound(c => c.text('custom missing', 404))
      app.all('/errors/*', c => c.text('outer'))
      app.route('/errors/child', child)
      app.get('/errors/exact', c => c.text('exact'))
      app.get('/errors/fail', () => {
        throw new Error('parent')
      })
    })(ctx))
    const response = await fetch(`${base}/errors/child/fail`)
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'child' })
    expect(response.headers.get('x-child')).toBe('seen')
    expect(await (await fetch(`${base}/errors/child/early`)).text()).toBe('early')
    expect(await (await fetch(`${base}/errors/child/missing`)).text()).toBe('custom missing')
    expect((await fetch(`${base}/errors/exact`, { method: 'POST' })).status).toBe(405)
    const failed = await fetch(`${base}/errors/fail`)
    expect(failed.status).toBe(503)
    expect(await failed.text()).toBe('parent')
  })

  it('rolls back partial registration and repeated disposal without removing replacements', async () => {
    disposers.push(defineWebServer(app => app.get('/occupied', c => c.text('existing')))(ctx))
    expect(() => defineWebServer((app) => {
      app.get('/temporary', c => c.text('temporary'))
      app.get('/occupied', c => c.text('conflict'))
    })(ctx)).toThrow('duplicate exact route')
    expect((await fetch(`${base}/temporary`)).status).toBe(404)
    expect(await (await fetch(`${base}/occupied`)).text()).toBe('existing')
    const dispose = defineWebServer(app => app.get('/temporary', c => c.text('new')))(ctx)
    dispose()
    disposers.push(defineWebServer(app => app.get('/temporary', c => c.text('replacement')))(ctx))
    dispose()
    expect(await (await fetch(`${base}/temporary`)).text()).toBe('replacement')
  })

  it('validates route declarations before any registration', () => {
    const invalid = ['/invalid\\?query', '//example.com', '/invalid\\path', '/invalid//', '/api//:id', '/trailing/']
    const register = vi.spyOn(ctx.webServer, 'register')
    for (const route of invalid) {
      expect(() => defineWebServer((app) => {
        app.get('/otherwise-valid', c => c.text('unused'))
        app.get(route, c => c.text('invalid'))
      })(ctx)).toThrow(TypeError)
    }
    expect(register).not.toHaveBeenCalled()
    register.mockRestore()
    expect(() => defineWebServer(app => app.get('/:id', c => c.text('root pattern')))(ctx)).toThrow('root-level patterns')
    expect(() => defineWebServer(app => app.all('*', c => c.text('root wildcard')))(ctx)).toThrow('root-level patterns')
    expect(() => defineWebServer(() => {})(new Context())).toThrow('webServer service')
    // @ts-expect-error handlers must be callable, including dynamically supplied handlers
    expect(() => defineWebServer(app => app.get('/invalid-handler', 'bad'))(ctx)).toThrow('route handlers must be callable')
    // @ts-expect-error setup must be callable
    expect(() => defineWebServer('invalid')).toThrow('requires a setup callback')
    // @ts-expect-error setup must return nothing or the app
    expect(() => defineWebServer(() => 'invalid')(ctx)).toThrow('setup must be synchronous')
    // @ts-expect-error a route must be a Hono path string
    expect(() => defineWebServer(app => app.get(undefined, c => c.text('unused')))(ctx)).toThrow(TypeError)
    // @ts-expect-error host route descriptors are not native Hono paths
    expect(() => defineWebServer(app => app.get({ kind: 'exact', path: '/removed' }, c => c.text('unused')))(ctx)).toThrow(TypeError)
  })

  it('keeps large responses and streams compressed, end callbacks and SSE working', async () => {
    const body = 'large gzip response '.repeat(256)
    const onEnd = vi.fn()
    const onRepeatedEnd = vi.fn()
    disposers.push(defineWebServer((app) => {
      app.get('/large', () => new Response(body, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=60' } }))
      app.get('/large-stream', () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
          controller.close()
        },
      }), { headers: { 'content-type': 'text/plain' } }))
      app.get('/large-node', (c) => {
        const res = (c.env as HttpBindings).outgoing
        res.setHeader('content-type', 'text/plain')
        res.setHeader('content-length', Buffer.byteLength(body))
        res.end(body, () => {
          onEnd()
          res.end(onRepeatedEnd)
        })
        return new Response(null, { headers: { 'x-hono-already-sent': 'true' } })
      })
      app.get('/sse', c => streamSSE(c, async (stream) => {
        await stream.writeSSE({ data: 'ready', event: 'status', id: '1' })
      }))
    })(ctx))
    for (const path of ['/large', '/large-stream', '/large-node']) {
      const response = await new Promise<{ encoding: string | string[] | undefined, body: Buffer }>((resolve, reject) => {
        const req = request(`${base}${path}`, { headers: { 'accept-encoding': 'gzip' } }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }))
          res.on('error', reject)
        })
        req.on('error', reject)
        req.setTimeout(3000, () => req.destroy(new Error('gzip response timed out')))
        req.end()
      })
      expect(response.encoding).toBe('gzip')
      expect(gunzipSync(response.body).toString()).toBe(body)
    }
    expect(onEnd).toHaveBeenCalledOnce()
    expect(onRepeatedEnd).toHaveBeenCalledWith(expect.objectContaining({ code: 'ERR_STREAM_ALREADY_FINISHED' }))
    const sse = await fetch(`${base}/sse`)
    expect(sse.headers.get('content-type')).toContain('text/event-stream')
    expect(await sse.text()).toBe('event: status\ndata: ready\nid: 1\n\n')
  })
})
