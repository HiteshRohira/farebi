# Convex backend

This is the only application backend. Authentication tokens are issued by
Shoo and verified by Convex through `auth.config.ts`.

Run `pnpm dev:backend` once to connect a development deployment and generate
`convex/_generated`. Then set the same Shoo audience in that deployment:

```sh
pnpm exec convex env set SHOO_CLIENT_ID origin:http://localhost:3000
```

Production must use its exact origin, for example
`origin:https://farebi.example.com`, as `SHOO_CLIENT_ID`.
