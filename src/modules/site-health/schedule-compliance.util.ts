import { AttendanceDayStatus, AttendancePunchType } from '../../common/enums';
import type { AttendanceRules } from '../attendance-rules/attendance-rules.service';

export interface DayScheduleFlags {
  lateCheckIn: boolean;
  earlyCheckIn: boolean;
  missedCheckIn: boolean;
  missedCheckOut: boolean;
  earlyCheckOut: boolean;
  lateCheckOut: boolean;
  missedLunchOut: boolean;
  missedLunchReturn: boolean;
  lateLunchOut: boolean;
  earlyLunchOut: boolean;
  lateLunchReturn: boolean;
  earlyLunchReturn: boolean;
}

const EMPTY_FLAGS: DayScheduleFlags = {
  lateCheckIn: false,
  earlyCheckIn: false,
  missedCheckIn: false,
  missedCheckOut: false,
  earlyCheckOut: false,
  lateCheckOut: false,
  missedLunchOut: false,
  missedLunchReturn: false,
  lateLunchOut: false,
  earlyLunchOut: false,
  lateLunchReturn: false,
  earlyLunchReturn: false,
};

function timeStringToMinutes(value: string): number | null {
  const [hh, mm] = value.split(':').map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function punchMinutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function getScheduleThresholds(rules: AttendanceRules) {
  return {
    dayIn: timeStringToMinutes(rules.dayInTime) ?? 8 * 60,
    lunchOut: timeStringToMinutes(rules.lunchOutTime) ?? 12 * 60,
    lunchIn: timeStringToMinutes(rules.lunchInTime) ?? 13 * 60,
    dayOut: timeStringToMinutes(rules.dayOutTime) ?? 17 * 60,
  };
}

function firstPunchOfType(
  punches: Array<{ type: string; at: string; isVoided: boolean }>,
  type: AttendancePunchType,
) {
  return punches.find((p) => !p.isVoided && p.type === type) ?? null;
}

function latestPunchOfType(
  punches: Array<{ type: string; at: string; isVoided: boolean }>,
  type: AttendancePunchType,
) {
  const live = punches.filter((p) => !p.isVoided && p.type === type);
  return live.length > 0 ? live[live.length - 1] : null;
}

function comparePunchToThreshold(
  punch: { at: string } | null,
  thresholdMinutes: number,
): { isEarly: boolean; isLate: boolean } {
  if (!punch) return { isEarly: false, isLate: false };
  const mins = punchMinutesOfDay(punch.at);
  return {
    isEarly: mins < thresholdMinutes,
    isLate: mins > thresholdMinutes,
  };
}

export function evaluateDayScheduleCompliance(
  day: {
    status: string;
    date: string;
    punches: Array<{ type: string; at: string; isVoided: boolean }>;
  },
  rules: AttendanceRules,
  todayKey: string,
): DayScheduleFlags {
  if (day.status === AttendanceDayStatus.ON_LEAVE) return { ...EMPTY_FLAGS };

  const thresholds = getScheduleThresholds(rules);
  const isPast = day.date < todayKey;
  const punches = day.punches.filter((p) => !p.isVoided);

  const dayIn = firstPunchOfType(punches, AttendancePunchType.DAY_IN);
  const dayOut = latestPunchOfType(punches, AttendancePunchType.DAY_OUT);
  const lunchOut = firstPunchOfType(punches, AttendancePunchType.LUNCH_OUT);
  const lunchIn = latestPunchOfType(punches, AttendancePunchType.LUNCH_IN);

  const flags: DayScheduleFlags = { ...EMPTY_FLAGS };

  if (isPast && !dayIn) flags.missedCheckIn = true;
  if (isPast && !!dayIn && !dayOut) flags.missedCheckOut = true;

  const dayInTiming = comparePunchToThreshold(dayIn, thresholds.dayIn);
  flags.earlyCheckIn = dayInTiming.isEarly;
  flags.lateCheckIn = dayInTiming.isLate;

  const dayOutTiming = comparePunchToThreshold(dayOut, thresholds.dayOut);
  flags.earlyCheckOut = dayOutTiming.isEarly;
  flags.lateCheckOut = dayOutTiming.isLate;

  const lunchOutTiming = comparePunchToThreshold(lunchOut, thresholds.lunchOut);
  flags.earlyLunchOut = lunchOutTiming.isEarly;
  flags.lateLunchOut = lunchOutTiming.isLate;

  const lunchInTiming = comparePunchToThreshold(lunchIn, thresholds.lunchIn);
  flags.earlyLunchReturn = lunchInTiming.isEarly;
  flags.lateLunchReturn = lunchInTiming.isLate;

  if (isPast && dayIn && dayOut && !lunchOut) flags.missedLunchOut = true;
  if (isPast && lunchOut && !lunchIn) flags.missedLunchReturn = true;

  return flags;
}

export function countScheduleViolations(flags: DayScheduleFlags): number {
  let n = 0;
  if (flags.lateCheckIn) n++;
  if (flags.earlyCheckIn) n++;
  if (flags.missedCheckIn) n++;
  if (flags.missedCheckOut) n++;
  if (flags.earlyCheckOut) n++;
  if (flags.lateCheckOut) n++;
  if (flags.missedLunchOut) n++;
  if (flags.missedLunchReturn) n++;
  if (flags.lateLunchOut) n++;
  if (flags.earlyLunchOut) n++;
  if (flags.lateLunchReturn) n++;
  if (flags.earlyLunchReturn) n++;
  return n;
}

/** Four expected punch checkpoints per expected workday. */
export const EXPECTED_PUNCH_CHECKS_PER_DAY = 4;
