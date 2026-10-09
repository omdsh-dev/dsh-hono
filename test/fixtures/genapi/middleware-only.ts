import { defineWebServer } from '../../../src/index'

export const server = defineWebServer((app) => {
  app.use(async (_c, next) => {
    await next()
  })
})
