import type { Context, TypedResponse } from 'hono'

interface InspectQuery {
  query?: string
}

export default function inspect(c: Context): TypedResponse<{ method: string, path: string, query: InspectQuery }, 200, 'json'> {
  const query = c.req.query() as InspectQuery
  return c.json({ method: c.req.method, path: c.req.path, query })
}
