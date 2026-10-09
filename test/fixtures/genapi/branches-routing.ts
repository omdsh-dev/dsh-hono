/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

const handler = (c: Context) => c.json(({ ok: true }))
export const chained = defineWebServer((app) => {
  app.get('/api/chain-a', handler).get('/api/chain-b', handler)
})
export const concise = defineWebServer(app => app.get('/api/concise', handler))
export const emptyStatement = defineWebServer((app) => {
  ;
  app.get('/api/after-empty', handler)
})
export const earlyReturn = defineWebServer((app) => {
  app.get('/api/early-return', handler)
  // eslint-disable-next-line no-useless-return, sonarjs/no-redundant-jump -- genapi's statement walker must see a bare return
  return
})
export const returnsApp = defineWebServer((app) => {
  app.get('/api/returns-app', handler)
  return app
})
export const returnsCall = defineWebServer((app) => {
  app.get('/api/returns-call-a', handler)
  return app.get('/api/returns-call-b', handler)
})
export const parenthesized = (defineWebServer((app) => {
  app.get('/api/parenthesized-server', handler)
}))
export default defineWebServer((app) => {
  app.get('/api/./normalized', handler)
  app.get('/api/plain-slash/', handler)
  app.get(`/api/template`, handler)
  app.on('GET', '/api/on-explicit', handler)
  app.use(async (_c, next) => {
    await next()
  })
})
