import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.post('/api/aliased-request', async (c) => {
    const req = c.req
    return c.json({ body: await req.json<{ message: string }>() })
  })
})
