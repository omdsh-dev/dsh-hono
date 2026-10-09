/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'

export const namedHandler = (c: Context) => c.json(({ named: true }))
export function functionHandler(c: Context) {
  return c.json({ fromFunction: true } as {
    fromFunction: boolean
  })
}
export default (c: Context) => c.json(({ fromDefault: true }))
