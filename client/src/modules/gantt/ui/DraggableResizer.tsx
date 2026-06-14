// Draggable Resizer Component for Table/Chart Split
import React, { useState, useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface DraggableResizerProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  storageKey?: string;
  className?: string;
}

export const DraggableResizer: React.FC<DraggableResizerProps> = ({
  defaultWidth = 400,
  minWidth = 200,
  maxWidth = 800,
  onResize,
  storageKey = 'gantt-table-width',
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const resizerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Load saved width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(storageKey);
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth, 10);
      if (parsedWidth >= minWidth && parsedWidth <= maxWidth) {
        setWidth(parsedWidth);
        onResize?.(parsedWidth);
      }
    }
  }, [storageKey, minWidth, maxWidth, onResize]);

  // Save width to localStorage when changed
  useEffect(() => {
    localStorage.setItem(storageKey, width.toString());
    onResize?.(width);
  }, [width, storageKey, onResize]);

  // Mouse down handler - start dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    
    // Add global mouse events
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Mouse move handler - update width
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + deltaX;
    
    // Constrain within min/max bounds
    const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    setWidth(clampedWidth);
  };

  // Mouse up handler - stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
    
    // Remove global mouse events
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <div
      ref={resizerRef}
      className={`
        relative w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize
        flex items-center justify-center group z-10
        ${isDragging ? 'bg-blue-500' : ''}
        ${className}
      `}
      onMouseDown={handleMouseDown}
      title="Drag to resize table width"
    >
      {/* Visual grip indicator */}
      <div className={`
        absolute inset-y-0 -left-1 -right-1 flex items-center justify-center
        ${isDragging ? 'bg-blue-500/20' : 'group-hover:bg-blue-400/20'}
        transition-colors
      `}>
        <GripVertical 
          className={`
            h-6 w-6 text-gray-400 
            ${isDragging ? 'text-blue-600' : 'group-hover:text-blue-600'}
            transition-colors
          `} 
        />
      </div>
      
      {/* Active resize indicator */}
      {isDragging && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-blue-600 text-white px-3 py-1 rounded-lg text-sm font-medium shadow-lg">
          Table Width: {width}px
        </div>
      )}
    </div>
  );
};

// Hook for managing resizable layout
export const useResizableLayout = (
  defaultWidth: number = 400,
  storageKey: string = 'gantt-table-width'
) => {
  const [tableWidth, setTableWidth] = useState(defaultWidth);

  useEffect(() => {
    const savedWidth = localStorage.getItem(storageKey);
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth, 10);
      if (parsedWidth >= 200 && parsedWidth <= 800) {
        setTableWidth(parsedWidth);
      }
    }
  }, [storageKey]);

  const handleResize = (width: number) => {
    setTableWidth(width);
    localStorage.setItem(storageKey, width.toString());
  };

  return {
    tableWidth,
    chartWidth: `calc(100% - ${tableWidth}px - 4px)`, // 4px for resizer
    handleResize
  };
};