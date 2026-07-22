# Project: Truth or Lie — Multiplayer Social Deduction Game

## Overview

A multiplayer party game where players join a room, receive a hidden role (Truth or Lie), submit a statement about themselves, discuss everyone's statements, vote, and receive points.

The core gameplay loop:

1. Player creates a room.
2. Other players join using room code.
3. When game starts, every player secretly receives:

   - Truth role → must write a real statement about themselves.
   - Lie role → must write a fake statement about themselves.

4. Everyone submits their statement.
5. All statements are revealed with player names.
6. Players discuss the revealed statements and lock in votes.
7. Scores are calculated.
8. Results are revealed.

---

# Tech Stack

## Frontend

- React
- TypeScript
- TanStack Router
- shadcn/ui
- Tailwind CSS
- Default dark mode only
- Minimal black/white aesthetic

## Backend

- Convex
- Convex realtime subscriptions
- Convex mutations/actions for game state changes

## Authentication

Use:

- Better Auth hosted on Convex
- Anonymous guest sign-in with a player-provided display name as the default
- Google OAuth as an optional sign-in method

Authentication is required for:

- Creating rooms
- Joining rooms
- Tracking player identity

---

# Design System

## Theme

The entire app uses dark mode permanently.

Colors:

Background:

- near black

Cards:

- dark gray

Text:

- white
- muted gray secondary text

Accent:

- white

No gradients.
No colorful UI.
No unnecessary animations.

Style inspiration:

- Linear
- Vercel dashboard
- shadcn defaults

---

# Core Entities

## User

Fields:

```
id
name
avatar (optional)
createdAt
```

---

## Room

Represents a game lobby.

Fields:

```
id
code
hostId

status:
  waiting
  writing
  voting
  results
  finished

maxPlayers: number

createdAt
startedAt
```

Default:

```
maxPlayers = 20
```

---

## Player

Represents a user inside a room.

Fields:

```
id

roomId
userId

role:
  truth
  lie

statement:
  string | null

score:
  number

hasSubmitted:
  boolean

hasVoted:
  boolean

createdAt
```

Important:

Role must remain hidden until results phase.

---

## Vote

Fields:

```
id

roomId

voterId

targetPlayerId

createdAt
```

---

# Game Flow

## Phase 1 — Lobby

URL:

```
/room/:code
```

Players see:

- Room code
- Player list
- Host indicator

Host sees:

"Start Game"

Before the game starts, the host confirms:

- Number of liars (defaults to 1)
- Writing time
- Discussion/voting time

Requirements:

- Minimum players: 3
- Maximum players: 20

---

# Phase 2 — Role Assignment

When host starts:

Backend randomly assigns roles.

Example:

5 players:

```
Player A → Truth
Player B → Lie
Player C → Truth
Player D → Truth
Player E → Truth
```

Rules:

- New rooms default to exactly one liar, regardless of player count.
- The host can increase the liar count before starting the round.
- At least one truth player must remain.
- Role assignment happens server-side.
- Client never decides roles.

---

# Phase 3 — Writing

Duration:

5 minutes by default

UI:

Large text input:

"Write your statement"

No prompts.

Players create their own statement.

Examples:

Truth:

"I once broke my arm playing cricket"

Lie:

"I have visited Antarctica"

Submit button.

When:

- everyone submits
  OR
- timer reaches 0

Move to discussion/voting phase.

---

# Phase 4 — Discussion + Voting

All statements appear.

Example:

```
Player 1
"I once met a celebrity"

Player 2
"I have never eaten pizza"

Player 3
"I can speak 4 languages"
```

Players know:

- Who wrote each statement

Players do NOT know:

- Truth/Lie role

Timer:

10 minutes by default

Players discuss the revealed statements, then vote when ready.

UI:

- Statement cards
- Vote controls

"Who is lying?"

Rules:

- Each player gets one vote.
- Players may vote for any statement, including their own.

The discussion/voting phase ends when:

- Everyone votes
  OR
- Timer ends

---

# Phase 5 — Results

Reveal:

- Each player's role
- Correct guesses
- Score changes

---

# Scoring System

## Liar

Base:

```
+30 points
```

Bonus:

For every player who voted incorrectly:

```
+10 points
```

Maximum possible:

```
70 points
```

---

## Truth Players

Correctly identify liar:

```
+10 points
```

Wrong vote:

```
0 points
```

---

Example:

Two liars.

Nobody catches them:

```
Liar A +50
Liar B +50
Everyone else +0
```

One liar gets caught:

```
Liar +30

Correct voters:
+10 each
```

---

# Convex Functions

## Rooms

Queries:

```
createRoom()

joinRoom(code)

getRoom(code)

startGame(roomId, liarCount, writingDurationSeconds, discussionVotingDurationSeconds)

addPhaseTime(roomId)

endPhaseEarly(roomId)
```

---

## Players

Queries:

```
getPlayers(roomId)
```

Mutations:

```
assignRoles(roomId)

submitStatement(playerId, statement)

vote(playerId,targetId)
```

---

## Game State

Mutation:

```
advancePhase(roomId)
```

Handles:

waiting
→ writing
→ voting
→ results

---

# Realtime Requirements

Use Convex subscriptions.

Clients should instantly update:

- player joined
- game started
- statements submitted
- timer changes
- votes
- results

No manual refresh.

---

# Routes

## Home

```
/
```

Contains:

- Create room button
- Join room input

---

## Room

```
/room/$code
```

Main game screen.

Changes based on room status.

States:

LobbyComponent

WritingComponent

VotingComponent

ResultsComponent

---

# Components

```
components/

RoomLobby.tsx

RoleCard.tsx

StatementInput.tsx

StatementList.tsx

DiscussionChat.tsx

VotingPanel.tsx

ScoreBoard.tsx

Timer.tsx
```

---

# Security Rules

Important:

Never send hidden roles before results.

Convex queries should return:

Lobby:

- players
- names

Writing:

- own role only

Voting:

- statements only

Results:

- everything

---

# MVP Scope

Implement only:

- Authentication
- Create room
- Join room
- 3–20 player multiplayer
- Truth/Lie assignment
- Statement submission
- Reveal
- Voting
- Score calculation

Do NOT implement:

- matchmaking
- friends
- ranking
- cosmetics
- voice chat

---

# Future Ideas

Possible additions:

- Multiple rounds
- Player reputation
- Custom room rules
- Voice discussion
- Anonymous mode
- AI generated categories (optional)
- Larger rooms

---

# Implementation Priority

1. Setup TanStack Router + shadcn
2. Setup Convex
3. Setup auth
4. Build room creation/joining
5. Build game state machine
6. Build realtime updates
7. Add scoring
8. Polish UI

End.
