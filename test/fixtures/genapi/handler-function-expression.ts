import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  // eslint-disable-next-line prefer-arrow-callback -- exercise native function-expression resolution
  app.get('/api/function-expression', function (c) {
    return c.json({ ok: true })
  })
})
