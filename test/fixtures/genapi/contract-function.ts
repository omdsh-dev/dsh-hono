/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

const handler = (c: Context) => c.json(({ onClick: () => 1 }))
export const server = defineWebServer((app) => {
  app.get('/api/function-contract', handler)
})
