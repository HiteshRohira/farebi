import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      to="/"
      aria-label="Farebi home"
      className={cn('group flex items-center gap-2.5', className)}
    >
      <img
        src="/logo192.png"
        alt=""
        width={192}
        height={192}
        className={cn(
          'shrink-0 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105',
          compact ? 'size-7' : 'size-8',
        )}
      />
      <span
        className={cn(
          'farebi-display font-black tracking-[-0.03em]',
          compact ? 'text-base' : 'text-lg',
        )}
      >
        Farebi
      </span>
    </Link>
  )
}
