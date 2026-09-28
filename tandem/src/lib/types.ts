import type { ISODate } from "./dates";
import type { Schedule, ScheduleKind } from "./habit-engine";

export type ColorName =
  | "rose" | "orange" | "amber" | "lime" | "emerald" | "teal" | "sky" | "blue" | "violet" | "fuchsia";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_emoji: string | null;
  avatar_color: ColorName;
  timezone: string;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  emoji: string;
  color: ColorName;
  start_date: ISODate;
  visibility: "group" | "private";
  reminder_time: string | null; // "HH:MM:SS"
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  habit_schedules: Schedule[];
}

export interface HabitHistory {
  days: ISODate[];
  noteDays: Set<ISODate>;
}

export type HistoryMap = Map<string, HabitHistory>;

export interface Group {
  id: string;
  name: string;
  emoji: string;
  invite_code: string;
  leaderboard_enabled: boolean;
  created_by: string | null;
  created_at: string;
}

export interface GroupMember {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profile: Profile;
}

export interface Reaction {
  id: string;
  completion_id: string;
  user_id: string;
  emoji: ReactionEmoji;
  created_at: string;
}

export interface Comment {
  id: string;
  completion_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface FeedItem {
  id: string;
  habit_id: string;
  user_id: string;
  completed_on: ISODate;
  note: string | null;
  created_at: string;
  habit: Pick<Habit, "id" | "name" | "emoji" | "color">;
  reactions: Reaction[];
  comments: Comment[];
}

export const REACTION_EMOJIS = ["🔥", "💪", "👏", "👀", "🎉"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface HabitInput {
  name: string;
  description: string;
  emoji: string;
  color: ColorName;
  start_date: ISODate;
  visibility: "group" | "private";
  reminder_time: string | null;
  kind: ScheduleKind;
  weekdays: number[];
  times_per_week: number;
  interval_days: number;
}
