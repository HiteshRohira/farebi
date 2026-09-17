# Farebi

Farebi is a realtime party-game platform for quick solo play and 3–20 player
rooms. Create a room, share its six-character code, and keep the same group
together across multiple rounds and games.

Play it at [farebi.vercel.app](https://farebi.vercel.app).

## Product trailer

[![Farebi product trailer preview](brag-output/brag.gif)](brag-output/brag.mp4)

[Watch with sound (MP4)](brag-output/brag.mp4)

Music: [“Happy Beats & Business Moves Vol. 10” by Sascha Ende](https://ende.app/en/song/12875-happy-beats-business-moves-vol-10),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Games

- **Who’s That?** — Hold the phone overhead while friends give clues for the
  famous face. It supports multiplayer rounds and an instant, room-free solo
  mode designed for landscape play.
- **Truth or Lie** — Players receive a secret truth or lie role, write a
  statement, discuss the room’s submissions, and vote for the liars. Hosts can
  configure liar count and phase timers; scores carry across rounds.
- **Impostor** — Most players receive one word while the impostors receive a
  related but different word. Discuss, vote, and eliminate suspects until every
  impostor is found. Hosts can configure impostor count, vote visibility, and
  how tied votes are resolved.

## Highlights

- Live room and game state powered by Convex subscriptions
- Name-only guest sign-in, with Google sign-in available when configured
- Persistent rooms that can switch games between rounds
- Active-room resume, explicit room switching, host controls, and player removal
- QR codes and six-character codes for joining on another device
- Dark-only UI with a web app manifest and mobile fullscreen experience
- Up to 20 players per multiplayer room
- Automatic cleanup of rooms after 24 hours of inactivity

Who’s That? includes a deliberately conservative catalogue of people broadly
recognizable in India. Built-in photos are resolved through Wikipedia’s
PageImages API; custom multiplayer picks can be name-only or include an image
uploaded to Convex storage. See the
[catalogue methodology](docs/celebrity-catalogue.md) for sourcing and selection
details.

## Tech stack

- React 19, TypeScript, and Vite
- TanStack Router
- Tailwind CSS and shadcn/ui
- Convex for the backend, database, storage, and realtime state
- Better Auth on Convex for guest sessions and optional Google OAuth
- Vitest and Testing Library

## Local development

Requirements: Node.js, pnpm, and a Convex account.

Install dependencies and connect a Convex development deployment:

```sh
pnpm install
pnpm dev:backend
```

The Convex command creates `.env.local` with `CONVEX_DEPLOYMENT`,
`VITE_CONVEX_URL`, and `VITE_CONVEX_SITE_URL`. Add the local frontend origin:

```sh
echo 'VITE_SITE_URL=http://localhost:3000' >> .env.local
```

Configure the deployment for Better Auth and name-only guest sessions:

```sh
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:3000
```

Google sign-in is optional. To enable it, add the credentials to Convex:

```sh
pnpm exec convex env set GOOGLE_CLIENT_ID your-google-client-id
pnpm exec convex env set GOOGLE_CLIENT_SECRET your-google-client-secret
```

Then register this authorized redirect URI in Google Cloud, using the value of
`VITE_CONVEX_SITE_URL` rather than the Vite origin:

```text
https://your-deployment.convex.site/api/auth/callback/google
```

Start the frontend and backend together:

```sh
pnpm dev
```

Open [localhost:3000](http://localhost:3000).

## Testing multiplayer locally

Each local origin gets separate browser storage, making it convenient to act as
multiple guest players. First allow the origins you need on the development
deployment:

```sh
pnpm exec convex env set TRUSTED_ORIGINS http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004
```

Then start one shared backend and five player origins:

```sh
pnpm dev:players --users=5 --open
```

`--users` accepts 1–20 and defaults to 3. Without `--open`, visit consecutive
ports beginning at `3000`. Add every non-3000 origin you use to
`TRUSTED_ORIGINS`; do not add development origins to a production deployment.

Guest sessions are isolated by origin. A Google account represents the same
player across origins. The UI normally shortens names to the first name, but
shows full display names when players in a room share one.

## Useful commands

```sh
pnpm dev             # Convex and Vite development servers
pnpm dev:web         # Vite only
pnpm dev:backend     # Convex only
pnpm dev:players     # Multiple isolated local player origins
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check           # Prettier check
```

## Deployment

For production, set the Convex `SITE_URL` variable and frontend `VITE_SITE_URL`
to the exact public app origin. If Google sign-in is enabled, configure the
production credentials and register the production Convex `.site` callback URL
with Google.

The included `vercel.json` rewrite serves the single-page app for direct room
links such as `/room/ABC123`, which TanStack Router then handles client-side.

## License

[MIT](LICENSE)
