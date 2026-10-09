# Contributing to dsh-hono

See the [contribution guide](https://github.com/antfu/contribute) for general guidance. Preserve the original MIT license and attribution.

Before proposing a change, read [repository rules](<AGENTS.md>) and keep native Hono Context/routing contracts intact. Reuse the host's `webServer`; do not start a second server. Input types do not replace validation.

Run the required gates:

```sh
pnpm lint
pnpm knip
pnpm test --run
pnpm typecheck
pnpm build
pnpm coverage
```

If a route contract or generator changes, rebuild the library, regenerate the playground clients, and check the example:

```sh
pnpm --filter dsh-plugin-playground genapi
pnpm --filter dsh-plugin-playground typecheck
pnpm --filter dsh-plugin-playground build
```

Keep the [Chinese README](<README.md>), [English README](<README.en.md>) and [skill](<skills/dsh-hono/SKILL.md>) consistent. Commit messages follow Conventional Commits; publish/release operations require explicit authorization.
