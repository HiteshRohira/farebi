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
5. All statements are revealed anonymously.
6. Players discuss and guess who the liars are.
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
- Google OAuth as the default sign-in method
- Anonymous guest sign-in with a player-provided display name

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
  discussion
  voting
  results
  finished

maxPlayers: number

createdAt
startedAt
```

Default:

```
maxPlayers = 5
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

Requirements:

- Minimum players: 3
- Maximum players: 5

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
Player D → Lie
Player E → Truth
```

Rules:

- At least one liar always exists.
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

Move to reveal phase.

---

# Phase 4 — Statement Reveal

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

---

# Phase 5 — Discussion

Timer:

3 minutes

Players discuss.

UI:

- Statement cards
- Chat box

Players can type messages.

Chat messages:

Fields:

```
roomId

senderId

message

createdAt
```

---

# Phase 6 — Voting

Players vote:

"Who is lying?"

Rules:

- Each player gets one vote.
- Cannot vote themselves.

Voting ends when:

- Everyone votes
  OR
- Timer ends

---

# Phase 7 — Results

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

startGame(roomId)
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
→ discussion
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

DiscussionComponent

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

Discussion:

- statements only

Results:

- everything

---

# MVP Scope

Implement only:

- Authentication
- Create room
- Join room
- 5 player multiplayer
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
