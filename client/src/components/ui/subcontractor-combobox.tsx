import * as React from "react"
import { Check, ChevronsUpDown, Building2, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface Subcontractor {
  id: number | string
  name: string
  company?: string
  trade?: string
  email?: string
}

interface SubcontractorComboBoxProps {
  subcontractors: Subcontractor[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  showTrade?: boolean
}

export function SubcontractorComboBox({
  subcontractors,
  value,
  onValueChange,
  placeholder = "Select subcontractor...",
  className,
  showTrade = true,
}: SubcontractorComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  


  const selectedSubcontractor = subcontractors?.find(
    (sub) => sub.id.toString() === value
  )

  const getDisplayName = (sub: Subcontractor) => {
    return sub.company || sub.name
  }

  // For selected display, show just the company/name (cleaner)
  const getSelectedDisplayText = (sub: Subcontractor) => {
    return getDisplayName(sub)
  }

  // For dropdown items, can show more detail
  const getFullDisplayText = (sub: Subcontractor) => {
    const name = getDisplayName(sub)
    return showTrade && sub.trade ? `${name} - ${sub.trade}` : name
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedSubcontractor ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{getSelectedDisplayText(selectedSubcontractor)}</span>
            </div>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" style={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
        <Command>
          <CommandInput placeholder="Search subcontractors..." />
          <CommandEmpty>No subcontractor found.</CommandEmpty>
          <CommandGroup>
            {subcontractors?.map((sub) => (
              <CommandItem
                key={sub.id}
                value={`${getDisplayName(sub)} ${sub.trade || ''} ${sub.name}`}
                onSelect={() => {
                  onValueChange(sub.id.toString())
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === sub.id.toString() ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex items-center gap-2 w-full">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{getDisplayName(sub)}</div>
                    {showTrade && sub.trade && (
                      <div className="text-sm text-gray-500">{sub.trade}</div>
                    )}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}