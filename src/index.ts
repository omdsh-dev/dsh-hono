/// <reference types="@deepseek-ai/dsh-host-webserver" preserve="true" />

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ErrorHandler, NotFoundHandler } from 'hono'
import type { RouterRoute } from 'hono/types'
import { ServerResponse } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'

/** 每次激活的 Cordis 服务实例，供请求上下文访问。 */
export interface HostServiceInstance<Options = undefined> {
  context: Context
  options: Options
}

export type HostService<Options = undefined> = (undefined extends Options
  ? (ctx: Context, options?: Options) => () => void
  : (ctx: Context, options: Options) => () => void) & {
    __host_instance?: HostServiceInstance<Options>
  }

declare module 'hono' {
  interface ContextVariableMap {
    __host_instance: HostServiceInstance<unknown>
  }
}

const DYNAMIC_ROUTE_RE = /\/[^/]*[:*({]/

/** 将原生 Hono 路由注册到宿主 WebServer，不另起 HTTP server。 */
export function defineWebServer<Options = undefined>(setup: (app: Hono) => void | Hono): HostService<Options> {
  if (typeof setup !== 'function')
    throw new TypeError('dsh-hono: defineWebServer requires a setup callback')

  const server = function (ctx: Context, options?: Options): () => void {
    const webServer = ctx?.webServer
    if (typeof webServer?.register !== 'function')
      throw new TypeError('dsh-hono: server(ctx) requires the webServer service')

    const instance: HostServiceInstance<Options> = { context: ctx, options: options as Options }
    const app = new Hono({ strict: false })
    const middleware = new Set<RouterRoute>()
    const nativeUse = app.use
    app.use = function (this: Hono, ...args: Parameters<typeof nativeUse>) {
      const start = this.routes.length
      const result = nativeUse.apply(this, args)
      for (const route of this.routes.slice(start))
        middleware.add(route)
      return result
    } as typeof nativeUse
    const mounted = new Map<RouterRoute, Omit<WebRoute, 'handler'>>()
    const nativeRoute = app.route.bind(app)
    app.route = ((...args: Parameters<typeof nativeRoute>) => {
      const [path] = args
      const ownership = hostRouteOf(`${path.replace(/\/$/, '')}/*`)
      const start = app.routes.length
      const result = nativeRoute(...args)
      for (const route of app.routes.slice(start))
        mounted.set(route, ownership)
      return result
    }) as typeof app.route
    // ponytail: setup uses the provided app; observe basePath clones if clone middleware ownership is needed.
    let onError: ErrorHandler | undefined
    const nativeOnError = app.onError
    app.onError = (handler) => {
      onError = handler
      return nativeOnError(handler)
    }
    let notFound: NotFoundHandler | undefined
    const nativeNotFound = app.notFound
    app.notFound = (handler) => {
      notFound = handler
      return nativeNotFound(handler)
    }
    app.use(async (c, next) => {
      c.set('__host_instance', instance)
      await next()
    })

    const result = setup(app)
    if (result !== undefined && result !== app)
      throw new TypeError('dsh-hono: setup must be synchronous and return nothing or the app')

    if (app.routes.some(route => typeof route.handler !== 'function'))
      throw new TypeError('dsh-hono: route handlers must be callable')
    const groups = new Map<string, { route: Omit<WebRoute, 'handler'>, methods: Set<string>, routes: Set<RouterRoute>, nativeMethods: boolean }>()
    for (const honoRoute of app.routes) {
      if (middleware.has(honoRoute))
        continue
      const route = mounted.get(honoRoute) ?? hostRouteOf(honoRoute.path)
      const key = `${route.kind}\0${route.path}`
      let group = groups.get(key)
      if (!group) {
        group = { route, methods: new Set(), routes: new Set(), nativeMethods: false }
        groups.set(key, group)
      }
      group.nativeMethods ||= mounted.has(honoRoute)
      group.methods.add(honoRoute.method)
      group.routes.add(honoRoute)
    }

    const disposers: Array<() => void> = []
    const dispose = (): void => {
      for (const unregister of disposers.splice(0).reverse())
        unregister()
      if (server.__host_instance === instance)
        delete server.__host_instance
    }

    try {
      for (const { route, methods, routes, nativeMethods } of groups.values()) {
        const routedApp = new Hono({ getPath: app.getPath })
        // Native route() preserves child error handlers; replay the original registration order.
        const selected = new Hono()
        selected.routes = app.routes.filter(r => middleware.has(r) || routes.has(r))
        if (onError)
          selected.onError(onError)
        routedApp.route('/', selected)
        if (notFound)
          routedApp.notFound(notFound)
        const handler = getRequestListener(routedApp.fetch, { overrideGlobalObjects: false })
        const unregister = webServer.register({
          ...route,
          handler: async (req, res) => {
            const method = req.method ?? 'GET'
            // Hono handles HEAD through GET, even for app.on('HEAD', ...).
            if (!nativeMethods && !methods.has('ALL') && !methods.has(method === 'HEAD' ? 'GET' : method)) {
              const allowed = new Set(methods)
              if (allowed.has('GET'))
                allowed.add('HEAD')
              res.writeHead(405, { allow: [...allowed].join(', ') })
              res.end()
              return
            }
            patchResponseEnd(res)
            await handler(req, res)
          },
        })
        disposers.push(unregister)
      }
    }
    catch (error) {
      dispose()
      throw error
    }
    server.__host_instance = instance
    return dispose
  } as HostService<Options>
  return server
}

/** 宿主压缩包装的 end 不转发 callback；保留 Node 响应完成回调的契约。 */
function patchResponseEnd(res: ServerResponse): void {
  const originalEnd = res.end
  res.end = function (chunk?: string | Uint8Array | (() => void), encoding?: BufferEncoding | (() => void), callback?: () => void) {
    const done = typeof chunk === 'function' ? chunk : typeof encoding === 'function' ? encoding : callback
    const chunkData = typeof chunk === 'function' ? undefined : chunk
    const encodingStr = typeof encoding === 'string' ? encoding : 'utf8'
    if (this.writableEnded)
      return ServerResponse.prototype.end.call(this, chunkData, encodingStr, done)
    if (done)
      this.once('finish', done)
    return originalEnd.call(this, chunkData, encodingStr)
  }
}

function hostRouteOf(pattern: string): Omit<WebRoute, 'handler'> {
  if (typeof pattern !== 'string')
    throw new TypeError('dsh-hono: route path must be a string')
  const dynamicIndex = pattern.search(DYNAMIC_ROUTE_RE)
  if (dynamicIndex === 0 || pattern === '*')
    throw new TypeError('dsh-hono: root-level patterns need a WebServer fallback; use a static prefix for named routes')
  const kind = dynamicIndex < 0 ? 'exact' : 'prefix'
  const path = dynamicIndex < 0 ? pattern : pattern.slice(0, dynamicIndex)
  if (!path.startsWith('/') || path.startsWith('//') || (path !== '/' && path.endsWith('/')) || /[?#\\]/.test(path) || new URL(path, 'http://localhost').pathname !== encodeURI(path).replace(/%25/g, '%'))
    throw new TypeError('dsh-hono: route path must be an absolute pathname without a trailing slash')
  return { kind, path: new URL(path, 'http://localhost').pathname }
}
