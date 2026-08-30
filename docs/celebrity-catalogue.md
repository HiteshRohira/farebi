# Celebrity catalogue

Farebi ships a conservative, name-only catalogue. It is meant for a mixed
party room in India, not as a general directory of notable humans. The test is:
“Would most people in India plausibly recognize this name through movies,
shows, news, social media, music, or sport?” Catalogue size is an outcome of
that test, not a target.

## Selection method

Candidates were compared across several open source pools:

- [Pantheon 1.0](https://www.nature.com/articles/sdata201575) and the
  [1,000 Celebrities Dataset](https://github.com/MushroomLin/1000-Celebrities-Dataset)
  for globally recognized historical figures.
- The Apache-2.0
  [Top 1,000 Celebrity Twitter Accounts](https://github.com/ahmedshahriar/TwitterCelebrityMatcher/tree/master/celebrity-listing)
  list as a signal for modern mass recognition.
- The CC-BY-4.0
  [Celebrity Face Recognition Dataset](https://github.com/prateekmehta59/Celebrity-Face-Recognition-Dataset)
  as a broad film and entertainment candidate pool.
- Wikipedia/Wikidata language coverage and sitelink counts as a secondary
  cross-cultural recognition signal.

No source was imported wholesale. Pantheon alone skews historical and
academic, social rankings skew American and short-lived, and face-recognition
lists skew toward actors. Candidates were combined, deduplicated, and then
editorially filtered using these rules:

1. Indian figures with durable national or major regional recognition are
   strongly preferred.
2. International figures stay only when their recognition plausibly crosses
   into Indian popular culture, school history, sport, or world affairs.
3. Recency helps when it reflects sustained mass recognition; prominence in a
   current foreign news cycle alone is not sufficient.
4. Timeless Indian figures are preferred over names known mainly from a recent
   release, trend, or award.
5. Niche professional importance, awards, or a Wikipedia page are not
   sufficient.
6. No profession/category hint is shown in the game.

The maintained list and its Wikipedia-title exceptions live in
`src/lib/celebrity-names.ts`. Custom name/photo submissions remain available
for people outside the defaults.

## Storage decision

Keep this catalogue in the frontend for now. The compiled list is small, gives
instant local filtering, avoids a loading/error state during player submission,
and ships with the rest of the room route. A backend table would add more
complexity than value while the catalogue is maintained by the project.

When community additions are introduced, move the approved catalogue to
Convex and add a separate moderation queue. Everyday users should propose a
name rather than directly modifying the shared catalogue. An approved record
should contain a normalized name, display name, optional Wikipedia title,
optional image storage ID, enabled status, submitter, and review timestamps.
Custom one-round picks should continue working independently of that queue.

## Photo workflow

`pnpm celebrities:photos` audits the whole catalogue against Wikipedia's
PageImages API. It resolves redirects, reports entries without a usable photo,
and can write a reviewable JSON manifest with
`pnpm celebrities:photos -- --output=tmp/celebrity-photos.json`.

The production workflow should eventually download reviewed thumbnails into
Convex Storage and save their storage IDs on approved catalogue records. This
keeps gameplay independent of a third-party request at selection time. Missing
or ambiguous photos remain name-only until reviewed; they should never be
filled with a generic placeholder.
