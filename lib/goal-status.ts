/**
 * COS-820 — what to say about a goal, in one line.
 *
 * A goal card can now carry three different facts — a measured metric, how its
 * tasks went this week, and how long is left — and showing all three at once
 * turns a card into a dashboard. This picks the one that is actually
 * actionable, in the order a patient would ask:
 *
 *   1. Is it overdue?            (nothing else matters yet)
 *   2. Am I doing the work?      (the thing they can change today)
 *   3. How long have I got?      (context, when there is no adherence signal)
 *
 * Returns null rather than a placeholder when there is nothing true to say. An
 * empty string on a card reads as a loading state that never resolves.
 */

export interface GoalStatusLine {
  text: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

export function goalStatusLine(goal: {
  progress?: {
    adherence?: { linkedTasks: number; scheduled: number; completed: number; percent: number | null; windowDays: number };
    daysRemaining?: number;
  };
}): GoalStatusLine | null {
  const p = goal.progress;
  if (!p) return null;

  const days = p.daysRemaining;

  // Overdue outranks everything. A goal three weeks past its date does not
  // need to be told it hit 80% adherence.
  if (typeof days === 'number' && days < 0) {
    const over = Math.abs(days);
    return { text: `${String(over)} day${over === 1 ? '' : 's'} past its target date`, tone: 'bad' };
  }

  const a = p.adherence;
  // `percent === null` means nothing was due — say so plainly rather than
  // rendering a 0 that reads as a failure.
  if (a && a.percent !== null && a.scheduled > 0) {
    const tone = a.percent >= 80 ? 'good' : a.percent >= 50 ? 'warn' : 'bad';
    const tail =
      typeof days === 'number' && days >= 0
        ? ` · ${days === 0 ? 'due today' : `${String(days)} day${days === 1 ? '' : 's'} left`}`
        : '';
    return {
      text: `${String(a.completed)} of ${String(a.scheduled)} this week${tail}`,
      tone,
    };
  }

  if (typeof days === 'number') {
    return {
      text: days === 0 ? 'Due today' : `${String(days)} day${days === 1 ? '' : 's'} left`,
      tone: days <= 7 ? 'warn' : 'neutral',
    };
  }

  // Linked tasks but nothing due in the window — a real, sayable state.
  if (a && a.linkedTasks > 0) {
    return { text: `${String(a.linkedTasks)} linked task${a.linkedTasks === 1 ? '' : 's'}`, tone: 'neutral' };
  }

  return null;
}
