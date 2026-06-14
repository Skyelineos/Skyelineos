import { Skeleton } from "@/components/ui/skeleton";

export function GanttLoadingSkeleton() {
  return (
    <div className="w-full h-[600px] bg-white rounded-lg border border-gray-200 p-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-[200px] h-6" />
        <div className="flex gap-2">
          <Skeleton className="w-20 h-8" />
          <Skeleton className="w-20 h-8" />
          <Skeleton className="w-20 h-8" />
        </div>
      </div>
      
      {/* Time scale skeleton */}
      <div className="flex mb-2">
        <div className="w-64 border-r border-gray-200">
          <Skeleton className="h-10" />
        </div>
        <div className="flex-1 flex">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-gray-200">
              <Skeleton className="h-10" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Task rows skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex">
            {/* Task name column */}
            <div className="w-64 border-r border-gray-200 p-2">
              <Skeleton className="h-6" />
            </div>
            {/* Timeline cells */}
            <div className="flex-1 flex">
              {Array.from({ length: 14 }).map((_, j) => (
                <div key={j} className="flex-1 border-r border-gray-200 p-1">
                  {/* Randomly show task bars */}
                  {(i + j) % 4 === 0 && (
                    <Skeleton className="h-5 rounded" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Loading message */}
      <div className="flex items-center justify-center mt-8 text-gray-500">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span>Loading schedule data...</span>
        </div>
      </div>
    </div>
  );
}