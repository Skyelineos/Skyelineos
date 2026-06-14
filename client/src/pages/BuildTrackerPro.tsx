import React from 'react';

// Import the BuildTracker Pro component from the root directory
const BuildTrackerProComponent = React.lazy(() => 
  import("../../../BuildTrackerPro-Complete-Fixed").then(module => ({
    default: module.default || module.BuildTrackerPro
  }))
);

export default function BuildTrackerProPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Loading BuildTracker Pro...</div>
    </div>}>
      <BuildTrackerProComponent />
    </React.Suspense>
  );
}