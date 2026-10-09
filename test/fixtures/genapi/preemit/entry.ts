import type { Context } from 'hono'
import { defineWebServer } from 'dsh-hono'

// eslint-disable-next-line ts/explicit-function-return-type -- preserve the inferred native JSON response
const handler = (c: Context) => c.json(({ ok: true }))
export const server = defineWebServer((app) => {
  app.get('/api/preemit', handler)
})
