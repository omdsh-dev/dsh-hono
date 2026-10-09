import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.on([], '/api/empty', c => c.json({ ok: true }))
})
