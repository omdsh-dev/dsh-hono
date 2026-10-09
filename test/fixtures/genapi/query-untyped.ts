import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.get('/api/query', c => c.json(c.req.query()))
})
