/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

const helper = { run: (...args: unknown[]) => args.length }
const handler = (c: Context) => c.json(({ ok: true }))
export const server = defineWebServer((_app) => {
  helper.run('/api/helper', handler)
})
