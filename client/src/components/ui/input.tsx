import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, ...props }, ref) => {
    // For numeric inputs, auto-select contents on focus so typing replaces
    // the existing value instead of appending to it. Per-input onFocus
    // handlers still run afterwards.
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (type === "number") e.target.select();
      onFocus?.(e);
    };
    return (
      <input
        type={type}
        onFocus={handleFocus}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm tabular-nums",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
