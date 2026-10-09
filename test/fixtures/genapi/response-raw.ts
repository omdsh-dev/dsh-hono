import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.get('/api/raw', () => new Response('plain'))
})
