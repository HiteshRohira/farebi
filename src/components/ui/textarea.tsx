import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-32 w-full resize-none rounded-2xl border border-input bg-black/10 px-4 py-4 text-base text-foreground shadow-xs outline-none placeholder:text-muted-foreground disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
