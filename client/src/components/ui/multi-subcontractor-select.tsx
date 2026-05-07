import * as React from "react"
import { Check, ChevronsUpDown, Building2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

interface MultiSubcontractorSelectProps {
  subcontractors: Subcontractor[]
  selectedIds: (string | number)[]
  onSelectionChange: (selectedIds: (string | number)[]) => void
  placeholder?: string
  className?: string
  showTrade?: boolean
  maxDisplay?: number
}

export function MultiSubcontractorSelect({
  subcontractors,
  selectedIds,
  onSelectionChange,
  placeholder = "Select subcontractors...",
  className,
  showTrade = true,
  maxDisplay = 2,
}: MultiSubcontractorSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selectedSubcontractors = subcontractors.filter(sub => 
    selectedIds.includes(sub.id.toString()) || selectedIds.includes(sub.id)
  )

  const getDisplayName = (sub: Subcontractor) => {
    return sub.company || sub.name
  }

  const handleSelect = (subId: string | number) => {
    const currentIds = selectedIds.map(id => id.toString())
    const targetId = subId.toString()
    
    if (currentIds.includes(targetId)) {
      onSelectionChange(selectedIds.filter(id => id.toString() !== targetId))
    } else {
      onSelectionChange([...selectedIds, subId])
    }
  }

  const handleRemove = (subId: string | number) => {
    onSelectionChange(selectedIds.filter(id => id.toString() !== subId.toString()))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between min-h-10", className)}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedSubcontractors.length > 0 ? (
              <>
                {selectedSubcontractors.slice(0, maxDisplay).map((sub) => (
                  <Badge
                    key={sub.id}
                    variant="secondary"
                    className="mr-1 mb-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(sub.id)
                    }}
                  >
                    {getDisplayName(sub)}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
                {selectedSubcontractors.length > maxDisplay && (
                  <Badge variant="secondary" className="mr-1 mb-1">
                    +{selectedSubcontractors.length - maxDisplay} more
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" style={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
        <Command>
          <CommandInput placeholder="Search subcontractors..." />
          <CommandEmpty>No subcontractor found.</CommandEmpty>
          <CommandGroup>
            {subcontractors.map((sub) => {
              const isSelected = selectedIds.includes(sub.id.toString()) || selectedIds.includes(sub.id)
              return (
                <CommandItem
                  key={sub.id}
                  value={`${getDisplayName(sub)} ${sub.trade || ''} ${sub.name}`}
                  onSelect={() => handleSelect(sub.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isSelected ? "opacity-100" : "opacity-0"
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
              )
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}