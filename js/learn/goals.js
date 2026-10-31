// Metas diária (minutos) e semanal (sessões). Puro: o estado vem de store.goals.
import { minutesOnDay, sessionsSince, weekStart, totalMinutes } from './stats.js';

export const DEFAULT_GOALS = { dailyMinutes: 15, weeklySessions: 5 };
export const sanitizeGoals = (g = {}) => ({
  dailyMinutes: Math.min(240, Math.max(1, Math.round(g.dailyMinutes ?? DEFAULT_GOALS.dailyMinutes))),
  weeklySessions: Math.min(50, Math.max(1, Math.round(g.weeklySessions ?? DEFAULT_GOALS.weeklySessions))),
});
export function dailyProgress(sessions, goals, now = Date.now()) {
  const g = sanitizeGoals(goals), minutes = minutesOnDay(sessions, now);
  return { minutes, target: g.dailyMinutes, ratio: Math.min(1, minutes / g.dailyMinutes), done: minutes >= g.dailyMinutes, remaining: Math.max(0, g.dailyMinutes - minutes) };
}
export function weeklyProgress(sessions, goals, now = Date.now()) {
  const g = sanitizeGoals(goals), week = sessionsSince(sessions, weekStart(now));
  return { sessions: week.length, target: g.weeklySessions, ratio: Math.min(1, week.length / g.weeklySessions), done: week.length >= g.weeklySessions, minutes: totalMinutes(week) };
}
