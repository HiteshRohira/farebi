import { spawn } from 'node:child_process'

const rawArgs = process.argv.slice(2)
const inlineUsers = rawArgs.find((argument) => argument.startsWith('--users='))
const usersIndex = rawArgs.indexOf('--users')
const requestedUsers = Number(
  inlineUsers?.slice('--users='.length) ??
    (usersIndex >= 0 ? rawArgs[usersIndex + 1] : 3),
)
const shouldOpen = rawArgs.includes('--open')

if (
  !Number.isInteger(requestedUsers) ||
  requestedUsers < 1 ||
  requestedUsers > 20
) {
  console.error('Usage: pnpm dev:players --users=5 [--open] (1–20 users)')
  process.exit(1)
}

const names = ['convex']
const commands = ['convex dev']
for (let index = 0; index < requestedUsers; index += 1) {
  names.push(`p${index + 1}`)
  commands.push(
    `vite dev --port ${3000 + index} --strictPort${shouldOpen ? ' --open' : ''}`,
  )
}

const palette = [
  'blue',
  'green',
  'yellow',
  'magenta',
  'cyan',
  'white',
  'blueBright',
  'greenBright',
  'yellowBright',
  'magentaBright',
  'cyanBright',
]
const colors = names.map((_, index) => palette[index % palette.length])

console.log(
  `Starting ${requestedUsers} isolated player origin${requestedUsers === 1 ? '' : 's'} on ports 3000–${2999 + requestedUsers}.`,
)
if (!shouldOpen) {
  console.log('Add --open to open every player origin in your browser.')
}

const child = spawn(
  'pnpm',
  [
    'exec',
    'concurrently',
    '-k',
    '--names',
    names.join(','),
    '--prefix-colors',
    colors.join(','),
    ...commands,
  ],
  { stdio: 'inherit' },
)

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
