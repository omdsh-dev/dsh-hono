import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.get('/api/mixed', c => c.req.header('x') ? c.json({ ok: true }) : c.text('plain'))
})
