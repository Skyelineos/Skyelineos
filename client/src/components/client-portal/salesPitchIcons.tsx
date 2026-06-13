// Small registry mapping the icon name stored on a sales-pitch section to an
// actual lucide-react component. Keeping it in one place lets both the card grid
// and the editor's icon picker stay in sync.

import {
  HardHat, DollarSign, Palette, LayoutDashboard, CalendarClock, ShieldCheck,
  Award, Rocket, Sparkles, Home, Hammer, Users, FileText, MapPin, Heart,
  Lightbulb, Camera, MessageSquare, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  HardHat, DollarSign, Palette, LayoutDashboard, CalendarClock, ShieldCheck,
  Award, Rocket, Sparkles, Home, Hammer, Users, FileText, MapPin, Heart,
  Lightbulb, Camera, MessageSquare,
};

export const ICON_NAMES = Object.keys(MAP);

export function SalesIcon({
  name, className, style,
}: { name: string; className?: string; style?: React.CSSProperties }) {
  const Icon = MAP[name] || Sparkles;
  return <Icon className={className} style={style} />;
}
