/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

interface Payload {
  name: string
  tags?: string[]
}
function write(c: Context) {
  const body = c.req.json<Payload>()
  return c.json({ received: !!body })
}
function nested(c: Context) {
  const inner = (): {
    q?: string
  } => c.req.query() as {
    q?: string
  }
  return c.json({ query: inner().q ?? '' })
}
export const server = defineWebServer((app) => {
  app.post('/api/readbody-object', write)
  app.get('/api/nested-query', nested)
})
