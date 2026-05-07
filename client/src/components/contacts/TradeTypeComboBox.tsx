import * as React from "react"
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ComboBox } from "@/components/ui/combobox"
import { apiRequest } from "@/lib/queryClient"
import { useToast } from "@/hooks/use-toast"

interface Trade {
  id: number;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TradeTypeComboBoxProps {
  value?: string
  onValueChange: (value: string) => void
  className?: string
}

export function TradeTypeComboBox({
  value,
  onValueChange,
  className,
}: TradeTypeComboBoxProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch trades from API
  const { data: trades = [], isLoading } = useQuery<Trade[]>({
    queryKey: ['/api/trades'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Create new trade mutation
  const createTradeMutation = useMutation({
    mutationFn: (tradeName: string) => 
      apiRequest('/api/trades', { 
        method: 'POST', 
        body: {
          name: tradeName,
          description: `Auto-created trade: ${tradeName}`,
          category: 'Construction',
          isActive: true
        }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      toast({
        title: "Trade Added",
        description: "New trade created successfully."
      });
    }
  });

  // Get only active trade names
  const activeTradeNames = trades
    .filter(trade => trade.isActive)
    .map(trade => trade.name)
    .sort();

  const handleValueChange = (newValue: string) => {
    // If it's a new trade type not in the list, create it
    if (newValue && !activeTradeNames.includes(newValue) && newValue.trim()) {
      createTradeMutation.mutate(newValue.trim());
    }
    onValueChange(newValue)
  }

  return (
    <ComboBox
      options={activeTradeNames}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "Loading trades..." : "Select or type trade type..."}
      searchPlaceholder="Search trade types..."
      className={className}
      allowCustom={true}
      emptyMessage="No trade types found."
      disabled={isLoading}
    />
  )
}