import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.get('/api/text', c => c.text('plain'))
})
