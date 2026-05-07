import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
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

interface ComboBoxProps {
  options: string[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  allowCustom?: boolean
  emptyMessage?: string
}

export function ComboBox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className,
  allowCustom = false,
  emptyMessage = "No option found.",
}: ComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")

  const handleSelect = (selectedValue: string) => {
    if (selectedValue === value) {
      onValueChange("")
    } else {
      onValueChange(selectedValue)
    }
    setOpen(false)
    setInputValue("")
  }

  const handleCustomAdd = () => {
    if (inputValue.trim() && !options.includes(inputValue.trim())) {
      onValueChange(inputValue.trim())
      setOpen(false)
      setInputValue("")
    }
  }

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(inputValue.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" style={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
        <Command>
          <CommandInput 
            placeholder={searchPlaceholder} 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandEmpty>
            {allowCustom && inputValue.trim() ? (
              <div className="p-2">
                <button
                  onClick={handleCustomAdd}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
                >
                  Add "{inputValue.trim()}"
                </button>
              </div>
            ) : (
              emptyMessage
            )}
          </CommandEmpty>
          <CommandGroup>
            {filteredOptions.map((option) => (
              <CommandItem
                key={option}
                value={option}
                onSelect={() => handleSelect(option)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === option ? "opacity-100" : "opacity-0"
                  )}
                />
                {option}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}