/* eslint-disable ts/explicit-function-return-type -- fixtures exercise inferred native Hono response types */
import type { Context } from 'hono'
import { defineWebServer } from '../../../src/index'

interface Payload {
  flag: boolean
  nothing: null
  at: Date
  list: string[]
  pair: [
    string,
        number?,
  ]
  rest: [
    string,
    ...number[],
  ]
  map: Record<string, number>
  counts: {
    [index: number]: string
  }
  union: string | number
  both: {
    a: string
  } & {
    b: number
  }
  kind: 'exact'
  level: 1
  extra: unknown
  nested: {
    deep: {
      value: boolean
    }
  }
  maybe?: string
}
function handler(c: Context) {
  return c.json(({
    flag: true,
    nothing: null,
    at: new Date(),
    list: [],
    pair: ['a'],
    rest: ['a'],
    map: {},
    counts: {},
    union: 'a',
    both: { a: 'a', b: 1 },
    kind: 'exact',
    level: 1,
    extra: undefined,
    nested: { deep: { value: true } },
  }) as Payload)
}
export const server = defineWebServer((app) => {
  app.get('/api/types', handler)
})
