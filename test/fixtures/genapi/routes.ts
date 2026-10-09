/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

interface EchoQuery {
  pretty?: string
  limit?: string
}
interface EchoBody {
  message: string
}
const readEcho = (c: Context) => c.json(({ query: c.req.query() as EchoQuery }))
async function writeEcho(c: Context) {
  const body = await c.req.json<EchoBody>()
  return c.json({ message: body?.message ?? '' })
}
export const server = defineWebServer((app) => {
  app.get('/api/health', (c: Context) => c.json(({ status: 'ok' })))
  app.get('/api/userID/list', (c: Context) => c.json(({ users: [{ id: 1 }] })))
  app.get('/api/echo/:channel', readEcho)
  app.post('/api/echo/:channel', writeEcho)
})
