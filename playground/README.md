# DSH 原生 Hono 插件示例 / Native Hono plugin example

使用 [dsh-hono](<../README.md>) 构建纯宿主插件：原生 Hono 路由运行在宿主已有 WebServer 上，不另起 HTTP 服务器、不监听额外端口。

This example registers native Hono routes on the host's existing WebServer. It does not start another server or bind a port.

## 项目结构 / Layout

```text
genapi.config.ts          # 静态读取服务入口，生成客户端 / static client generation
cordis.patch.yml          # 将编译后插件注入 DSH Profile / loader patch
tsdown.config.ts          # 打包宿主代码，保留外部依赖 / host-only build
src/
├── index.ts              # inject + apply + Cordis effect
├── host/server/
│   ├── index.ts          # defineWebServer + native Hono registrations
│   └── routes/
│       ├── health.ts     # Context options + uptime
│       ├── server.ts     # Cordis Context + host port
│       ├── inspect.ts    # method/path + typed string query
│       └── echo.ts       # path parameter + validated typed query/JSON body
└── client/apis/
    ├── index.ts          # generated fetch request functions
    └── index.type.ts     # generated contracts
```

业务处理器接受 `hono` 的原生 Context，使用 `c.req`，通过 `c.json(...)` 返回有类型 JSON 响应。服务入口集中注册路由，插件入口通过 Cordis effect 管理生命周期。`getServerContext(c)` / `getServerOptions<Options>(c)` 获取本次激活的宿主依赖。

Handlers accept native Hono Contexts and return typed JSON with `c.json(...)`. The service entry registers routes; the plugin entry manages activation/disposal through Cordis effects. Context helpers access the current activation's host dependencies.

## 构建与生成 / Build and generate

本示例使用 `workspace:*` 主包，必须先构建库。从仓库根目录执行：

The local workspace library must be built first. Run from the repository root:

```sh
pnpm install
pnpm build
pnpm --filter dsh-plugin-playground genapi
pnpm --filter dsh-plugin-playground typecheck
pnpm --filter dsh-plugin-playground build
```

最终宿主插件入口为 `playground/dist/index.mjs`，不包含客户端代码。GenAPI 通过 [配置](<genapi.config.ts>) 从 `dsh-hono/genapi` 读取原生路由；生成过程不启动 DSH，也不执行处理器。

The host-only output is `playground/dist/index.mjs`. [GenAPI config](<genapi.config.ts>) imports `dsh-hono/genapi`; generation never starts DSH or executes route handlers.

## 客户端调用 / Client calls

在同源客户端导入[生成的 API](<src/client/apis/index.ts>)：

Import the [generated client](<src/client/apis/index.ts>) in a same-origin application:

```ts
import {
  getApiEchoChannel,
  getApiHealth,
  getApiInspect,
  getApiServer,
  postApiEchoChannel,
} from './apis'

const health = await getApiHealth()
const server = await getApiServer()
const request = await getApiInspect({ query: '1' })
const read = await getApiEchoChannel({ channel: 'demo' }, { pretty: 'true', limit: '2' })
const write = await postApiEchoChannel(
  { channel: 'demo' },
  { message: 'hello', tags: ['example'], metadata: { source: 'client' } },
  { pretty: 'false', limit: '3' },
)

console.log(health.uptimeMs, server.port, request.query, read.limit, write.body.message)
```

参数依次为 path、body（若有）、query（若有）和可选原生 `RequestInit`。Query 使用真实 wire 字符串；echo 处理器在运行时校验并转换 `pretty`/`limit`，POST 校验 JSON 及 message/tags/metadata。类型声明不替代校验。

Arguments are path, body (when present), query (when present), and optional native `RequestInit`. Query values are wire strings; echo validates/converts `pretty`/`limit` and validates JSON/body fields. Type declarations alone are not validation.

生成 preset 使用相对 URL 与原生 fetch，不提供 `baseURL` 参数。独立 Node 客户端需自行配置适当的 origin/transport；不要将不存在的选项传入 API。

The installed preset uses relative URLs and native fetch, not a `baseURL` option. Independent Node clients need an appropriate origin/transport configuration.

### 静态生成边界 / Static boundaries

- `c.req.query() as Query`、`c.req.json<Body>()` 提供请求契约，`c.json(...)` 的 TypedResponse 提供响应契约。
- 支持静态路径、静态前缀下简单 `:parameter`、原生 `app.on` 方法/路径数组、单处理器和链式调用。
- 本示例 `/api/inspect/*` 仅生成固定 `/api/inspect` 客户端。子路径可以直接请求，但不由 GenAPI 枚举。
- 根通配符、参数化通配符前缀、复杂正则、动态注册、子应用挂载、多处理器路由与非 JSON 响应不在生成子集内；运行时支持不表示可生成客户端。
- 响应沿用聚合 JSON contract200，不是完整状态码映射；middleware 提前响应与 error hook 不生成独立契约。
- 生成文件由生成器维护，不手动修改；重新生成后检查类型与 build。

Generation extracts typed native query/JSON reads and JSON responses. It supports static/simple parameter routes, native method/path arrays and one handler per route. The terminal wildcard produces only the fixed base client. Dynamic registration, child mounts, multiple handlers and non-JSON responses are unsupported. Responses use the existing aggregated `200` contract, not a complete status map or independent middleware/error contracts. Regenerate clients instead of hand-editing them.

## 加载到已有宿主 / Load into a host

本次迁移不启动服务器。需要试用时，在你自己的宿主启动流程应用 [loader patch](<cordis.patch.yml>)。从 **playground 目录**运行以下命令，确保 patch 中的相对插件入口正确解析：

This migration does not start a server. When testing in your own host, apply the [loader patch](<cordis.patch.yml>) from the **playground directory**, so its relative plugin entry resolves correctly:

```sh
dsh web --patch ./cordis.patch.yml
```

若已有 DSH 运行，不要再启动第二份；在其正常重启流程应用 patch。`inject = ['webServer']` 等待宿主准备就绪，卸载 Loader 条目时 effect 自动移除路由。

Do not start a second instance beside an existing DSH server; apply the patch during its normal restart. Injection waits for `webServer`, and unloading the loader entry disposes routes.

## 请求验证 / Request checks

仅在已加载此插件的宿主上请求，端口以实际宿主配置为准：

Run these requests only against a host already loading the plugin, using its configured port:

```sh
curl http://127.0.0.1:3080/api/health
# {"status":"ok","uptimeMs":...}
curl http://127.0.0.1:3080/api/server
# {"port":3080}
curl 'http://127.0.0.1:3080/api/inspect/request?query=1'
# {"method":"GET","path":"/api/inspect/request","query":{"query":"1"}}
curl 'http://127.0.0.1:3080/api/echo/demo?pretty=true&limit=2'
# channel/method + pretty:true + limit:2 + raw string query
curl -X POST http://127.0.0.1:3080/api/echo/demo -H 'Content-Type: application/json' -d '{"message":"hello"}'
# channel/method + validated body + defaults pretty:false, limit:10
curl -X POST http://127.0.0.1:3080/api/health
# 405 Method Not Allowed
curl 'http://127.0.0.1:3080/api/echo/demo?limit=-1'
# 400 Bad Request
```

先确认路由未被宿主/其他插件占用；冲突时修改服务入口并重新生成 API。路径声明必须 canonical、无末尾斜杠（根 `/` 除外）；宿主 exact `/api/health` 不接收 `/api/health/`。示例未配置鉴权与 body 大小限制，扩展为敏感接口前请补充原生 Hono 中间件。

Check route ownership before loading. Canonical declarations have no trailing slash except `/`; host exact `/api/health` does not dispatch `/api/health/`. The example has no authentication/body size limits; configure native middleware before exposing sensitive operations.
