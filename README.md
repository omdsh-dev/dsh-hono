# dsh-hono

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![coverage][coverage-src]][coverage-href]
[![License][license-src]][license-href]

🔥 **dsh-hono** 为 DeepSeek Harness 插件 host 集成 [Hono](<https://hono.dev/>)——轻量、快速、基于 Web 标准的 Web 框架，提供原生路由与丰富的中间件，通过 Cordis 管理注册与卸载。

中文 · [English](<README.en.md>)

## 📦 安装

```sh
pnpm add dsh-hono hono@4.13.13
```

<details>
<summary>Are you an AI?</summary>

可运行 <code>npx skills add omdsh-dev/dsh-hono --skill dsh-hono -y</code> 安装技能。请先询问使用者需要支持哪些 Agent，通过 <code>--agent</code> 避免安装不需要的代理目录。

</details>

## 特性

- **原生 Hono**：Context 处理器、中间件、路由参数、子应用和链式调用。
- **宿主路由**：使用原生字符串路径，内部推导宿主的 exact/prefix 匹配。
- **上下文与选项**：从服务或 Hono Context 读取本次激活的 Cordis Context 与选项。
- **生命周期清理**：通过 Cordis effect 卸载；注册失败仅回滚本次激活的改动。
- **复用宿主服务**：使用 `ctx.webServer`，不启动额外服务器、不占用 fallback。
- **客户端 API**：通过 GenAPI 静态生成请求函数和类型，无需执行宿主代码。

> 使用 Hono **4.13.13**，内部使用官方 `@hono/node-server` 适配器。插件激活前，宿主必须提供 `webServer`。

## 🚀 快速开始

### 1. 定义与激活路由服务

```ts
// src/host/server/routes/health.ts
import type { Context } from 'hono'

export const health = (c: Context) => c.json({ status: 'ok' })
```

```ts
// src/host/server/index.ts
import { defineWebServer } from 'dsh-hono'
import { health } from './routes/health'

export const server = defineWebServer((app) => {
  app.get('/api/health', health)
  app.get('/api/version', c => c.json({ version: '1.0.0' }))
  app.get('/api/inspect/*', c => c.json({ path: c.req.path }))
})
```

```ts
// src/host/apply.ts
import type { Context } from '@deepseek-ai/cordis'
import { server } from './server'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx), 'example:routes')
}
```

`server(ctx)` 返回可重复调用的卸载函数。通过 `ctx.effect` 激活后，插件卸载时自动移除相应路由。注册失败只回滚本次激活，不影响已有路由。

### 2. 读取上下文与配置选项

通过 `server(ctx, options)` 的第二个参数传入配置或运行时依赖：

```ts
// src/host/server/index.ts
import { defineWebServer } from 'dsh-hono'
import { status } from './routes/status'

export interface Options {
  startedAt: number
}

export const server = defineWebServer<Options>(app => app.get('/api/status', status))
```

```ts
// src/host/server/routes/status.ts
import type { Context } from 'hono'
import type { Options } from '../index'
import { getServerContext, getServerOptions } from 'dsh-hono/utils'

export function status(c: Context) {
  const ctx = getServerContext(c)
  const options = getServerOptions<Options>(c)
  return c.json({ port: ctx.webServer.port, uptimeMs: Date.now() - options.startedAt })
}
```

```ts
// src/host/apply.ts
import type { Context } from '@deepseek-ai/cordis'
import { getServerContext, getServerOptions } from 'dsh-hono/utils'
import { server } from './server'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => server(ctx, { startedAt: Date.now() }), 'status:routes')
  getServerContext(server) // 返回本次激活传入的 Cordis Context
  getServerOptions(server) // 自动推断为 Options
}
```

每次激活独立捕获 Context 与选项。同一服务在多个宿主中激活时，请求始终使用其所属激活的数据，不会被后续激活覆盖。

### 3. 原生中间件与子应用

```ts
import { defineWebServer } from 'dsh-hono'
import { Hono } from 'hono'

const child = new Hono()
child.get('/text', c => c.text(c.req.method))

const server = defineWebServer((app) => {
  app.use('/api/*', async (c, next) => {
    await next()
    c.header('X-Plugin', 'example')
  })
  app.route('/api', child)
})
```

使用 Hono Context 处理器与 `(c, next)` 中间件，不传入 Node.js `(req, res)` 回调。官方 Node 适配器在内部连接宿主 HTTP 请求；**不要调用 `serve()` 或监听额外端口**。子应用挂载与多处理器路由支持运行时，但不属于 GenAPI 静态生成子集。

## 🛠️ 生成客户端 API

`dsh-hono/genapi` 提供 GenAPI 的 `original` 构建阶段，静态分析服务入口与原生 Hono 处理器，**无需加载插件或执行宿主代码**。

### 1. 安装开发依赖

```sh
pnpm add -D @genapi/core @genapi/pipeline @genapi/presets
```

### 2. 配置 pipeline

```ts
// genapi.config.ts
import { defineConfig } from '@genapi/core'
import pipeline from '@genapi/pipeline'
import { fetch } from '@genapi/presets'
import { original } from 'dsh-hono/genapi'

export default defineConfig({
  preset: pipeline(
    fetch.ts.config,
    original,
    fetch.ts.parser,
    fetch.ts.compiler,
    fetch.ts.generate,
    fetch.ts.dest,
  ),
  input: './src/host/server/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
```

### 3. 声明 JSON 请求与响应契约

```ts
import type { Context } from 'hono'

interface EchoQuery { name?: string }
interface EchoBody { message: string }

export async function echo(c: Context) {
  const query = c.req.query() as EchoQuery
  const body = await c.req.json<EchoBody>()
  // 类型声明不是校验；使用不可信字段前应验证其运行时类型。
  return c.json({ name: query.name ?? 'guest', message: body.message })
}
```

通过 `app.post('/api/echo', echo)` 注册，再执行：

```sh
pnpm exec genapi
```

生成的 fetch 客户端分别接收 body 与 query 参数。[playground 示例](<playground/README.md>) 包含输入校验和实际生成的客户端调用方法。

### 规则与限制

- `defineWebServer` 必须直接声明在模块顶层；setup 必须同步且可静态解析。
- 支持 `app.get/post/put/patch/delete/options`、`app.on('POST', ...)`（包含原生方法/路径数组）和链式调用。Hono 通过 GET 处理 HEAD，没有 `app.head` 注册方法。
- 支持静态字符串及静态前缀下的简单 `:parameter` 路由；`/api/users/:id` 生成必填路径参数。
- 非根、完全静态前缀后的末尾 `/*` 仅生成固定 base 端点：`/api/inspect/*` 生成请求 `/api/inspect` 的客户端，不生成任意子路径客户端。
- 在处理器内直接调用 `c.req.query() as Query` 和 `c.req.json<Body>()`（各最多一次），必须保留 Context 标识符的直接 `c.req` 访问；不支持解构 Context 或 `const req = c.req` 等请求别名，生成器会拒绝这些写法而非静默遗漏请求契约（原生运行时仍支持）。query 原始值是字符串，Hono query API 不接受对象类型泛型。响应必须通过 `c.json(...)` 返回有类型的 JSON 响应。
- 保留现有聚合 JSON 响应契约，输出在 `200` 下，不生成完整状态码映射；`app.use` 的提前响应与 error hook 响应不单独建模。
- 函数及类型名称由路径与 HTTP 方法生成（如 `getApiHealth`、`GetApiHealthResponse`）；可用 `patch.operations` 自定义客户端函数名。
- 不支持动态条件、循环、子应用挂载、多处理器路由、根通配符、带参数前缀的通配符、复杂正则、Node 回调、递归类型和非 JSON 响应。不支持的语法会报告源码位置；多处理器会明确拒绝，避免静默丢失中间件提前响应的契约。

## 💡 示例项目

[basic 示例](<playground/README.md>) 包含独立原生路由文件、[GenAPI 配置](<playground/genapi.config.ts>)与[生成的客户端 API](<playground/src/client/apis/index.ts>)，复用宿主已有服务器。

```sh
# 仓库根目录
pnpm install
pnpm build
pnpm --filter dsh-plugin-playground genapi
pnpm --filter dsh-plugin-playground build
pnpm --filter dsh-plugin-playground typecheck
```

需加载编译后的插件时，在启动自己的 DSH Profile 时应用 [loader patch](<playground/cordis.patch.yml>)；不要在已有宿主旁再启动一份服务器。具体工作目录与命令参见示例说明。

## 📚 API 参考

### `defineWebServer<Options>(setup)`

```ts
import type { Hono } from 'hono'

function defineWebServer<Options = undefined>(
  setup: (app: Hono) => void | Hono,
): HostService<Options>
```

每次激活创建全新原生 Hono 实例，设置 `strict: false`。setup 必须同步执行，返回 `undefined` 或传入的 app。原生 Context 处理器、中间件、`app.on`、`app.route` 与链式调用保持可用。宿主所有权跟踪基于传入的 app；暂不保证 `basePath()` 克隆上的中间件所有权，需前缀分组时使用 `app.route('/prefix', child)`。

### `getServerContext(server | c)` / `getServerOptions<Options>(server | c)`

导入自 `dsh-hono/utils`。接受激活中的服务或其原生 Hono Context，返回本次激活的 Cordis Context/选项。服务实例自动推断选项类型；从请求 Context 读取时显式传入选项类型。

`server.__host_instance` 指向最近一次成功激活的实例。卸载旧实例不清除新实例；卸载当前实例后不回退到更早的实例。服务未激活或 Context 不属于本库时，两个 helper 均抛出 `TypeError`。

### `original(configRead)`

导入自 `dsh-hono/genapi`，在 GenAPI pipeline 中填充路由及类型元数据。

### 字符串路径与宿主匹配

| 原生 Hono 路径 | 宿主匹配 |
| --- | --- |
| `/api/version` | exact `/api/version` |
| `/api/users/:id` | prefix `/api/users`，由 Hono 解析参数 |
| `/api/inspect/*` | prefix `/api/inspect`，由 Hono 解析通配符 |

路径声明必须 canonical、无末尾斜杠（根 `/` 除外），如 `/x/` 会被拒绝。`strict: false` 不放宽声明校验或宿主 exact 分发：`/x/` 不进入宿主 exact `/x` 路由。

动态路径推导首个动态片段前的静态前缀。根级路由模式（`/:id`、`/*`）不支持。前缀按路径片段匹配，`/api/inspection` 不属于 `/api/inspect`。全局 `app.use('*', ...)` 中间件本身不注册宿主路由。

直接声明的路由按宿主组保留方法与路径所有权：匹配路径上不允许的方法返回 `405` 和 `allow`；HEAD 回退 GET。`all`、HEAD 与模式路由不会越过所属组。宿主 `(kind, path)` 冲突时仅回滚新激活。

`app.route('/mount', child)` 将整个挂载点作为一个宿主 prefix 所有权单元，子应用的方法匹配与 404 由原生 Hono 控制，不套用直接路由的 405 分组规则。已有宿主 exact 路由仍优先于 prefix 挂载。

> 🔐 身份认证、鉴权与 Body 大小限制由插件保障。敏感接口请配置原生 Hono 中间件（如 `hono/body-limit`）。请求类型声明不能代替输入校验。

## 🛠️ 开发与贡献

```sh
pnpm install
pnpm lint
pnpm knip
pnpm test --run
pnpm typecheck
pnpm build
pnpm coverage # 校验配置的 90% 覆盖率阈值
```

## 📜️ 许可证

MIT。保留原许可与署名。

[npm-version-src]: https://img.shields.io/npm/v/dsh-hono?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/dsh-hono
[npm-downloads-src]: https://img.shields.io/npm/dm/dsh-hono?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/dsh-hono
[bundle-src]: https://img.shields.io/bundlephobia/minzip/dsh-hono?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=dsh-hono
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/dsh-hono
[coverage-src]: https://codecov.io/gh/omdsh-dev/dsh-hono/graph/badge.svg
[coverage-href]: https://codecov.io/gh/omdsh-dev/dsh-hono
[license-src]: https://img.shields.io/github/license/omdsh-dev/dsh-hono.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/omdsh-dev/dsh-hono/blob/main/LICENSE.md
