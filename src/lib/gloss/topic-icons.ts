import {
  Briefcase,
  Cpu,
  Drama,
  FlaskConical,
  GraduationCap,
  HeartPulse,
  Hourglass,
  Inbox,
  Landmark,
  MessageSquareQuote,
  PenTool,
  Plane,
  Shapes,
  Tag,
  Trophy,
  Utensils,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { TopicId } from "@/lib/gloss/palette.ts";

const TOPIC_ICONS: Record<string, LucideIcon> = {
  technology: Cpu,
  science: FlaskConical,
  business: Briefcase,
  finance: Landmark,
  politics: Vote,
  health: HeartPulse,
  culture: Drama,
  history: Hourglass,
  design: PenTool,
  education: GraduationCap,
  travel: Plane,
  food: Utensils,
  sports: Trophy,
  opinion: MessageSquareQuote,
  other: Shapes,
  unsorted: Inbox,
};

/** Category icon, or a plain tag for free-form tags. */
export function topicIcon(topic: TopicId): LucideIcon {
  return Object.hasOwn(TOPIC_ICONS, topic) ? TOPIC_ICONS[topic]! : Tag;
}
