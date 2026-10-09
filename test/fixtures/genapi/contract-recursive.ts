/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

interface Tree {
  child: Tree | null
}
const handler = (c: Context) => c.json(({ child: null }) as Tree)
export const server = defineWebServer((app) => {
  app.get('/api/tree', handler)
})
