import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Circle, Trash2 } from 'lucide-react';

interface PhotoAnnotatorProps {
  imageUrl: string;
  onDone: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}

const COLORS = [
  { label: 'Red',    value: '#EF4444' },
  { label: 'Yellow', value: '#EAB308' },
  { label: 'Blue',   value: '#3B82F6' },
  { label: 'Green',  value: '#22C55E' },
  { label: 'White',  value: '#FFFFFF' },
];

export function PhotoAnnotator({ imageUrl, onDone, onCancel }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#EF4444');
  const [strokeSize, setStrokeSize] = useState(4);
  const [tool, setTool] = useState<'pen' | 'circle'>('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const circleStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(img.naturalWidth, Math.min(window.innerWidth - 80, 700));
      const scale = maxW / img.naturalWidth;
      setCanvasSize({ width: maxW, height: img.naturalHeight * scale });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    setIsDrawing(true);
    if (tool === 'circle') {
      circleStart.current = pos;
    } else {
      lastPos.current = pos;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, strokeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || tool !== 'pen') return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPos.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    if (tool === 'circle' && circleStart.current) {
      // For touch end, use last known position via circleStart offset
      let pos = circleStart.current;
      try { pos = getPos(e as any); } catch {}
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const dx = pos.x - circleStart.current.x;
        const dy = pos.y - circleStart.current.y;
        const radius = Math.sqrt(dx * dx + dy * dy) || 30;
        ctx.beginPath();
        ctx.arc(circleStart.current.x, circleStart.current.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeSize;
        ctx.stroke();
      }
      circleStart.current = null;
    }
    setIsDrawing(false);
    lastPos.current = null;
  };

  const handleClear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
  };

  const handleDone = () => {
    const merged = document.createElement('canvas');
    merged.width = canvasSize.width;
    merged.height = canvasSize.height;
    const ctx = merged.getContext('2d')!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
      if (canvasRef.current) ctx.drawImage(canvasRef.current, 0, 0);
      onDone(merged.toDataURL('image/jpeg', 0.85));
    };
    img.src = imageUrl;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg px-3 py-2">
        <button
          onClick={() => setTool('pen')}
          className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${tool === 'pen' ? 'text-white' : 'border-gray-300 text-gray-600 bg-white'}`}
          style={tool === 'pen' ? { backgroundColor: '#C9A96E', borderColor: '#C9A96E' } : {}}
        >
          Pen
        </button>
        <button
          onClick={() => setTool('circle')}
          className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium border transition-colors ${tool === 'circle' ? 'text-white' : 'border-gray-300 text-gray-600 bg-white'}`}
          style={tool === 'circle' ? { backgroundColor: '#C9A96E', borderColor: '#C9A96E' } : {}}
        >
          <Circle className="w-3 h-3" /> Circle
        </button>

        <div className="flex gap-1 ml-1">
          {COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              title={c.label}
              className="w-5 h-5 rounded-full border-2 transition-transform"
              style={{
                backgroundColor: c.value,
                borderColor: color === c.value ? '#141414' : '#D1D5DB',
                transform: color === c.value ? 'scale(1.25)' : 'scale(1)',
                boxShadow: c.value === '#FFFFFF' ? 'inset 0 0 0 1px #ccc' : undefined,
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-xs text-gray-500">Size</span>
          <input
            type="range" min={2} max={20} value={strokeSize}
            onChange={e => setStrokeSize(Number(e.target.value))}
            className="w-16 accent-amber-500"
          />
          <span className="text-xs text-gray-400 w-3">{strokeSize}</span>
        </div>

        <button
          onClick={handleClear}
          className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {/* Drawing surface */}
      {canvasSize.width > 0 && (
        <div
          className="relative rounded-lg overflow-hidden border border-gray-200 select-none touch-none"
          style={{ width: '100%', maxWidth: canvasSize.width }}
        >
          <img
            src={imageUrl}
            alt="Annotate"
            style={{ width: '100%', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleDone} style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}>
          <Check className="w-4 h-4 mr-1" /> Done
        </Button>
      </div>
    </div>
  );
}
