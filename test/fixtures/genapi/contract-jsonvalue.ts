import { defineWebServer } from '../../../src/index'

type JSONValue = string | { child: JSONValue }

export const server = defineWebServer((app) => {
  app.get('/api/recursive-jsonvalue', c => c.json({ value: 'text' } as { value: JSONValue }))
})
