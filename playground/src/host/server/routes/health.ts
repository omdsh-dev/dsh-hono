import type { Context, TypedResponse } from 'hono'
import type { ServerOptions } from '..'
import { getServerOptions } from 'dsh-hono/utils'

export default function health(c: Context): TypedResponse<{ status: string, uptimeMs: number }, 200, 'json'> {
  const { startedAt } = getServerOptions<ServerOptions>(c)
  return c.json({ status: 'ok', uptimeMs: Date.now() - startedAt })
}
