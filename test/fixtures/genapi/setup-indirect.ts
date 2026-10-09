/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

const handler = (c: Context) => c.json(({ ok: true }))
export const server = defineWebServer((app) => {
  const registered = app.get('/api/registered', handler)
  void registered
})
