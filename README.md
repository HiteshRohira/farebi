# Farebi

A realtime multiplayer truth-or-lie game built with React, TanStack Router,
Tailwind CSS, shadcn/ui, Convex, and Shoo authentication.

## Stack boundaries

- Convex is the only backend and database.
- Shoo is the only authentication provider.
- The UI is permanently dark; there is no theme switcher or light palette.
- Realtime room state comes from Convex subscriptions (`useQuery`).

## Local setup

Install dependencies:

```sh
pnpm install
```

Connect a Convex development deployment:

```sh
pnpm dev:backend
```

The command creates `.env.local` with `CONVEX_DEPLOYMENT` and
`VITE_CONVEX_URL`. Configure the Shoo token audience on that deployment:

```sh
pnpm exec convex env set SHOO_CLIENT_ID origin:http://localhost:3000
```

Then run the frontend and Convex watcher together:

```sh
pnpm dev
```

Open `http://localhost:3000`. Shoo uses `/shoo/callback` as the local callback
route and does not require an application registration.

## Three-player local testing

Enable the extra localhost Shoo audiences on the development deployment only:

```sh
pnpm exec convex env set FAREBI_ENV development
pnpm exec convex env set ALLOW_LOCAL_MULTIUSER_TESTS true
```

Start one shared Convex backend and three frontend origins:

```sh
pnpm dev:players
```

Open ports `3000`, `3001`, and `3002`. Shoo gives the same Google account a
different pairwise identity for each origin, while all three clients share the
same Convex room data. Do not set either local-testing variable on a production
deployment.

Player names use their Google first name. When two players in a room have the
same first name, both are shown by their full Google name instead.

For production, set `SHOO_CLIENT_ID` on the production Convex deployment to
the exact public origin, for example `origin:https://farebi.example.com`.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
