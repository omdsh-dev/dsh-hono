/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

async function handler(c: Context) {
  const body = await c.req.json<[
    string,
    number,
  ]>()
  return c.json({ head: body?.[0] ?? '' })
}
export const server = defineWebServer((app) => {
  app.post('/api/readbody-tuple', handler)
})
