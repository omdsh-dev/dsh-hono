/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

const handler = (c: Context) => c.json(({ ok: true }))
export const server = defineWebServer((app) => {
  // eslint-disable-next-line prefer-const -- genapi must reject non-const route bindings
  let local = handler
  app.get('/api/local', local)
})
