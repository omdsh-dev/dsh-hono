/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

declare const enabled: boolean
const handler = (c: Context) => c.json(({ ok: true }))
if (enabled) {
  const nested = defineWebServer((app) => {
    app.get('/api/nested-module', handler)
  })
  void nested
}
