import { defineWebServer } from '../../../src/index'

const nodeCallback = (_request: unknown, _response: unknown): undefined => undefined
export const server = defineWebServer((app) => {
  app.get('/api/node-callback', (() => nodeCallback)() as never)
})
