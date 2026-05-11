import * as React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TradeTypeComboBox } from "./TradeTypeComboBox"

// Note: outer Button (Add) imported above is intentional — only the per-chip
// remove uses a plain <button> for sizing.

interface MultiTradeSelectorProps {
  value?: string[]
  onValueChange: (trades: string[]) => void
  className?: string
  disabled?: boolean
}

export function MultiTradeSelector({
  value = [],
  onValueChange,
  className,
  disabled = false,
}: MultiTradeSelectorProps) {
  const [selectedTrades, setSelectedTrades] = React.useState<string[]>(value)
  const [currentTrade, setCurrentTrade] = React.useState<string>("")

  React.useEffect(() => {
    setSelectedTrades(value)
  }, [value])

  const handleAddTrade = (trade: string) => {
    if (trade && !selectedTrades.includes(trade)) {
      const newTrades = [...selectedTrades, trade]
      setSelectedTrades(newTrades)
      onValueChange(newTrades)
      setCurrentTrade("")
    }
  }

  const handleRemoveTrade = (tradeToRemove: string) => {
    const newTrades = selectedTrades.filter(trade => trade !== tradeToRemove)
    setSelectedTrades(newTrades)
    onValueChange(newTrades)
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Selected trades display */}
        {selectedTrades.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTrades.map((trade) => (
              <Badge
                key={trade}
                variant="secondary"
                className="flex items-center gap-1 pr-1 whitespace-nowrap max-w-full"
              >
                <span className="truncate max-w-[16rem]">{trade}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${trade}`}
                    className="inline-flex items-center justify-center h-4 w-4 p-0 rounded-sm hover:bg-black/10 flex-shrink-0"
                    onClick={() => handleRemoveTrade(trade)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {/* Add new trade. min-w-0 on the input container keeps flexbox from
            blowing out and clipping the Add button when the modal is narrow. */}
        {!disabled && (
          <div className="flex gap-2 items-stretch">
            <div className="flex-1 min-w-0">
              <TradeTypeComboBox
                value={currentTrade}
                onValueChange={setCurrentTrade}
                className="w-full"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleAddTrade(currentTrade)}
              disabled={!currentTrade || selectedTrades.includes(currentTrade)}
              className="flex-shrink-0"
            >
              Add
            </Button>
          </div>
        )}

        {selectedTrades.length === 0 && disabled && (
          <span className="text-sm text-muted-foreground">No trades specified</span>
        )}
      </div>
    </div>
  )
}