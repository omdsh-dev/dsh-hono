import type { Context, TypedResponse } from 'hono'
import { getServerContext } from 'dsh-hono/utils'

export default function serverInfo(c: Context): TypedResponse<{ port: number }, 200, 'json'> {
  const ctx = getServerContext(c)
  return c.json({ port: ctx.webServer.port })
}
