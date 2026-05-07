interface MinimalSpinnerProps {
  title?: string;
}

export function MinimalSpinner({ title = "Loading" }: MinimalSpinnerProps) {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
        <p className="text-sm text-gray-600">{title}...</p>
      </div>
    </div>
  );
}