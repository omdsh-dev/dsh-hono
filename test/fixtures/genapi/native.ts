import type { Context, Next } from 'hono'
import { defineWebServer } from '../../../src/index'

interface Payload {
  message: string
  tags?: string[]
}

// Generation must read this module, never execute its plugin code.
throw new Error('GenAPI executed the service entry')

export const server = defineWebServer((app) => {
  app.on(['GET', 'POST'], ['/api/native-a', '/api/native-b'], c => c.json({ ok: true }))
  app.options('/api/options', c => c.json({ allowed: true }))
  app.on('HEAD', '/api/head', c => c.json({ ok: true }))
  app.get('/api/query', (c) => {
    const query = c.req.query() as { search: string, page?: string }
    const unrelated = { query: () => ({ ignored: 'value' }) }
    unrelated.query()
    return c.json({ ...query, at: new Date() })
  })
  app.post('/api/body', async (c: Context, _next: Next) => {
    const body = await c.req.json<Payload>().catch(() => ({ message: '' }))
    return c.json({ message: body.message }, 201)
  })
  app.get('/api/union', (c) => {
    if (c.req.header('x-fail'))
      return c.json({ error: 'failed' }, 400)
    return c.json({ result: 1 })
  })
})
