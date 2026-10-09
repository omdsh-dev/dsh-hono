import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.post('/api/destructured', async ({ req, json }) => json({ body: await req.json<{ message: string }>() }))
})
