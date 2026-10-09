import type { Context } from '@deepseek-ai/cordis'
import type { Context as HonoContext } from 'hono'
import type { HostService, HostServiceInstance } from './index'

export function getServerContext<Options>(source: HostService<Options> | HonoContext): Context {
  return instanceOf(source).context
}

export function getServerOptions<Options>(source: HostService<Options> | HonoContext): Options {
  return instanceOf(source).options
}

function instanceOf<Options>(source: HostService<Options> | HonoContext): HostServiceInstance<Options> {
  const instance = typeof source === 'function'
    ? source.__host_instance
    : source?.get('__host_instance') as HostServiceInstance<Options> | undefined
  if (!instance)
    throw new TypeError('dsh-hono: service is not active or context does not belong to a host service')
  return instance
}
