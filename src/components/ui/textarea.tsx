import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-32 w-full resize-none rounded-md border border-input bg-transparent px-3 py-3 text-base text-foreground shadow-xs outline-none placeholder:text-muted-foreground disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
