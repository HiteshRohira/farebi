# Farebi

A party-game platform with instant solo play and realtime multiplayer, built with React, TanStack Router,
Tailwind CSS, shadcn/ui, Convex, and Better Auth. The same room can currently
play Truth or Lie, Who’s That?, and Impostor. The game is chosen before creating
a room, and Who’s That? can also start instantly in a room-free landscape solo
mode.

Who’s That? ships with a conservative catalogue of people broadly recognizable
in India. Built-in photos are resolved through
Wikipedia's PageImages API; custom picks can be a name only or include a photo
uploaded to Convex storage. See the
[catalogue methodology](docs/celebrity-catalogue.md) for source and selection
details.

## Stack boundaries

- Convex is the only backend and database.
- Better Auth runs on Convex with name-only guest sign-in and optional Google
  sign-in.
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

The command creates `.env.local` with `CONVEX_DEPLOYMENT`,
`VITE_CONVEX_URL`, and `VITE_CONVEX_SITE_URL`. Add the frontend origin too:

```sh
echo 'VITE_SITE_URL=http://localhost:3000' >> .env.local
```

Configure Better Auth on the Convex development deployment:

```sh
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:3000
pnpm exec convex env set GOOGLE_CLIENT_ID your-google-client-id
pnpm exec convex env set GOOGLE_CLIENT_SECRET your-google-client-secret
```

In Google Cloud, register this exact authorized redirect URI (use the value of
`VITE_CONVEX_SITE_URL`, not the Vite origin):

```text
https://your-deployment.convex.site/api/auth/callback/google
```

Then run `pnpm dev` and open `http://localhost:3000`.

## Multi-player local testing

Allow the extra Vite origins on the development deployment only:

```sh
pnpm exec convex env set TRUSTED_ORIGINS http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004
```

Start one shared Convex backend and any number of isolated player origins:

```sh
pnpm dev:players --users=5
```

Add `--open` to open every origin automatically. Otherwise, open ports `3000`
through `3004`, then enter a
different name on each port. Better Auth stores each anonymous session in that
origin's local storage, so every port becomes a separate player. A Google
account still represents one player across every origin. Do not set
development-only trusted origins on a production deployment.

`--users` accepts 1–20 and defaults to 3. Add every port after 3000 that you
plan to use to `TRUSTED_ORIGINS` before starting the test.

Google player names use their first name, while guest players use the name they
enter. When two players in a room have the same first name, both are shown by
their full display name instead.

For production, set `SITE_URL` to the exact public app origin. Name-only guest
sign-in works in every environment. If Google sign-in is offered, also configure
the production Google credentials and register the production Convex `.site`
callback URL with Google.

Vercel uses the rewrite in `vercel.json` to serve the SPA for direct room URLs
such as `/room/ABC123`, allowing TanStack Router to handle scanned invites.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
