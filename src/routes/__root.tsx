import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Toaster } from 'sonner'

import '../styles.css'

export const Route = createRootRoute({ component: RootComponent })

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster theme="dark" position="top-center" />
      {import.meta.env.DEV ? (
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      ) : null}
    </>
  )
}
