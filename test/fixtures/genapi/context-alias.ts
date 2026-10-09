import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.post('/api/aliased-context', async (c) => {
    const context = c
    return context.json({ body: await context.req.json<{ message: string }>() })
  })
})
