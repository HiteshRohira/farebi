import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'expire inactive rooms',
  { hours: 1 },
  internal.rooms.expireInactiveRooms,
)

export default crons
