import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.on('GET', '/api/middleware', async (_c, next) => {
    await next()
  }, c => c.json({ ok: true }))
})
