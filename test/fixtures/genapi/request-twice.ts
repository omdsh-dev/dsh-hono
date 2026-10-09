/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

function handler(c: Context) {
  return c.json(({
    first: c.req.query() as {
      a?: string
    },
    second: c.req.query() as {
      b?: string
    },
  }))
}
export const server = defineWebServer((app) => {
  app.get('/api/query-twice', handler)
})
