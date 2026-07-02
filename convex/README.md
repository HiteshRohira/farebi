# Convex backend

This is the only application backend. Authentication tokens are issued by
Better Auth on the Convex HTTP site and verified by Convex through
`auth.config.ts`.

Run `pnpm dev:backend` once to connect a development deployment and generate
`convex/_generated`. Then configure Better Auth in that deployment:

```sh
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:3000
pnpm exec convex env set GOOGLE_CLIENT_ID your-google-client-id
pnpm exec convex env set GOOGLE_CLIENT_SECRET your-google-client-secret
```

Google's authorized redirect URI must use the Convex HTTP site:

```text
https://your-deployment.convex.site/api/auth/callback/google
```
