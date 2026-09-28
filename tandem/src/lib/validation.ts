import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3–20 characters: letters, numbers or _");

export const displayNameSchema = z.string().trim().min(1, "Tell your friends what to call you").max(40, "Keep it under 40 characters");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

export const habitNameSchema = z.string().trim().min(1, "Give your habit a name").max(60, "Keep it under 60 characters");

export const noteSchema = z.string().trim().max(280, "Notes are limited to 280 characters");

export const groupNameSchema = z.string().trim().min(1, "Name your group").max(50, "Keep it under 50 characters");

/** Only allow same-origin relative redirects (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/today"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
