import * as React from "react";
import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

const tradeOptions = [
  "Foundation",
  "Framing", 
  "Roofing",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Drywall",
  "Flooring",
  "Painting",
  "Cabinetry",
  "Landscaping",
  "Concrete",
  "Insulation",
  "Masonry",
  "Siding",
  "Windows",
  "Doors",
  "Tile",
  "Countertops",
  "Appliances"
];

interface MultiTradeSelectProps {
  selectedTrades: string[];
  onTradesChange: (trades: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiTradeSelect({
  selectedTrades,
  onTradesChange,
  placeholder = "Select trades...",
  className
}: MultiTradeSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleTrade = (trade: string) => {
    const newTrades = selectedTrades.includes(trade)
      ? selectedTrades.filter(t => t !== trade)
      : [...selectedTrades, trade];
    onTradesChange(newTrades);
  };

  const removeTrade = (trade: string) => {
    onTradesChange(selectedTrades.filter(t => t !== trade));
  };

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between min-h-10"
          >
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedTrades.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selectedTrades.map((trade) => (
                  <Badge
                    key={trade}
                    variant="secondary"
                    className="text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTrade(trade);
                    }}
                  >
                    {trade}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search trades..." />
            <CommandList>
              <CommandEmpty>No trade found.</CommandEmpty>
              <CommandGroup>
                {tradeOptions.map((trade) => (
                  <CommandItem
                    key={trade}
                    value={trade}
                    onSelect={() => toggleTrade(trade)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedTrades.includes(trade) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {trade}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}