import {
  Award,
  BadgeCheck,
  Briefcase,
  FileText,
  Mic,
  Presentation,
  Sparkles,
  Terminal,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  hackathon: Terminal,
  workshop: Wrench,
  symposium: Presentation,
  internship: Briefcase,
  conference: Mic,
  competition: Trophy,
  'paper-presentation': FileText,
  certification: BadgeCheck,
  'club-activity': Users,
  other: Sparkles,
}

/** Icon for an event category slug; custom admin-created categories fall back to a generic award. */
export function categoryIcon(slug: string | null | undefined): LucideIcon {
  return (slug && ICONS[slug]) || Award
}
