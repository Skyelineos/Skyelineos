// e.g., src/pages/WbsDemo.tsx
import React from 'react';
import WbsGantt from '@/components/gantt/WbsGantt';
import { sampleWbs } from '@/components/gantt/sampleWbs';

export default function WbsDemo() {
  return <WbsGantt projectName="Christensen Home" tasks={sampleWbs} className="p-4" />;
}