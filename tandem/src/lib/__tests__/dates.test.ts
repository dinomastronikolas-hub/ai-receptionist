import { describe, expect, it } from "vitest";
import {
  addDays,
  diffDays,
  fromDayNum,
  isoWeekday,
  relativeDayLabel,
  toDayNum,
  todayInTimeZone,
  weekStartDayNum,
} from "../dates";

describe("calendar arithmetic", () => {
  it("round-trips ISO dates through day numbers", () => {
    for (const iso of ["1970-01-01", "2024-02-29", "2026-09-28", "2030-12-31"]) {
      expect(fromDayNum(toDayNum(iso))).toBe(iso);
    }
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2027-01-01", "2026-12-25")).toBe(7);
  });

  it("is unaffected by DST transitions", () => {
    // US DST ends 2026-11-01, EU DST ends 2026-10-25.
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("computes ISO weekdays and week starts (Monday)", () => {
    expect(isoWeekday("2026-09-28")).toBe(1); // Monday
    expect(isoWeekday("2026-10-04")).toBe(7); // Sunday
    expect(fromDayNum(weekStartDayNum(toDayNum("2026-10-04")))).toBe("2026-09-28");
    expect(fromDayNum(weekStartDayNum(toDayNum("1970-01-01")))).toBe("1969-12-29");
  });

  it("rejects malformed dates", () => {
    expect(() => toDayNum("2026-9-28")).toThrow();
  });
});

describe("todayInTimeZone", () => {
  // 2026-09-28T02:30Z: still Sep 27 in the Americas, Sep 28 in Europe/Asia.
  const instant = new Date("2026-09-28T02:30:00Z");

  it("uses the user's wall clock, not UTC", () => {
    expect(todayInTimeZone("UTC", instant)).toBe("2026-09-28");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-09-27");
    expect(todayInTimeZone("America/Los_Angeles", instant)).toBe("2026-09-27");
    expect(todayInTimeZone("Europe/Berlin", instant)).toBe("2026-09-28");
    expect(todayInTimeZone("Asia/Tokyo", instant)).toBe("2026-09-28");
  });

  it("handles extreme offsets", () => {
    const late = new Date("2026-09-28T11:30:00Z");
    expect(todayInTimeZone("Pacific/Kiritimati", late)).toBe("2026-09-29"); // UTC+14
    expect(todayInTimeZone("Pacific/Pago_Pago", late)).toBe("2026-09-28"); // UTC-11
  });

  it("falls back to UTC for an invalid zone", () => {
    expect(todayInTimeZone("Not/AZone", instant)).toBe("2026-09-28");
  });

  it("handles the DST gap day", () => {
    // 2026-03-08 07:30Z is 03:30 EDT after the spring-forward jump.
    expect(todayInTimeZone("America/New_York", new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-08");
  });
});

describe("relativeDayLabel", () => {
  it("labels recent days", () => {
    expect(relativeDayLabel("2026-09-28", "2026-09-28")).toBe("Today");
    expect(relativeDayLabel("2026-09-27", "2026-09-28")).toBe("Yesterday");
  });
});
