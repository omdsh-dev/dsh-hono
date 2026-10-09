import type { Context } from '@deepseek-ai/cordis'
import { server } from './host/server'

export const name = 'hono-basic'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx, { startedAt: Date.now() }), 'hono-basic:routes')
}
