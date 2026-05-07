// src/modules/gantt/ui/Legends.tsx
import React from 'react';
import { useGantt } from '../state';

export default function Legends() {
  const { showCritical, showBaseline } = useGantt();

  return (
    <div className="flex items-center gap-4 p-2 text-xs text-gray-600 bg-gray-50 border-t rounded-b-lg">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-green-500 rounded"></div>
        <span>Summary Tasks</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-teal-500 rounded"></div>
        <span>Regular Tasks</span>
      </div>
      {showCritical && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>Critical Path</span>
        </div>
      )}
      {showBaseline && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-gray-400 rounded"></div>
          <span>Baseline</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-gray-200 rounded"></div>
        <span>Weekends</span>
      </div>
    </div>
  );
}