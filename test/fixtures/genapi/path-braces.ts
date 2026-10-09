import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.get('/api/{id}', (c: Context) => c.json(({ ok: true })))
})
