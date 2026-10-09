import type { Context, TypedResponse } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface EchoQuery {
  pretty?: string
  limit?: string
}

interface EchoBody {
  message: string
  tags?: string[]
  metadata?: Record<string, string>
}

interface EchoResult {
  channel: string | undefined
  method: string
  pretty: boolean
  limit: number
  query: EchoQuery
}

function queryOptions(query: EchoQuery): { pretty: boolean, limit: number } {
  const limit = query.limit === undefined ? 10 : Number(query.limit)
  if ((query.pretty !== undefined && query.pretty !== 'true' && query.pretty !== 'false')
    || !Number.isSafeInteger(limit) || limit < 0 || query.limit === '') {
    throw new HTTPException(400, { message: 'pretty must be true/false and limit a non-negative integer' })
  }
  return { pretty: query.pretty === 'true', limit }
}

export function readEcho(c: Context): TypedResponse<EchoResult, 200, 'json'> {
  const query = c.req.query() as EchoQuery
  return c.json({
    channel: c.req.param('channel'),
    method: c.req.method,
    ...queryOptions(query),
    query,
  })
}

export async function writeEcho(c: Context): Promise<TypedResponse<EchoResult & { body: EchoBody }, 200, 'json'>> {
  const body = await c.req.json<EchoBody>().catch(() => {
    throw new HTTPException(400, { message: 'body must be valid JSON' })
  })
  const query = c.req.query() as EchoQuery
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.message !== 'string'
    || (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some(tag => typeof tag !== 'string')))
    || (body.metadata !== undefined && (!body.metadata || typeof body.metadata !== 'object'
      || Array.isArray(body.metadata) || Object.values(body.metadata).some(value => typeof value !== 'string')))) {
    throw new HTTPException(400, { message: 'body requires a string message, optional string tags and string metadata' })
  }
  return c.json({
    channel: c.req.param('channel'),
    method: c.req.method,
    ...queryOptions(query),
    body,
    query,
  })
}
