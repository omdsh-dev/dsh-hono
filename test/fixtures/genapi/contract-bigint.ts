/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

const handler = (c: Context) => c.json(({ total: 1n }))
export const server = defineWebServer((app) => {
  app.get('/api/bigint', handler)
})
