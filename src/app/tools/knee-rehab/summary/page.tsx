import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { css, cx } from '@styled-system/css';
import { getEntries, getExercises } from '@/lib/kv';
import type { ExerciseEntry, RehabEntry } from '@/types';

const LOOKBACK_DAYS = 30;
const TREND_WINDOW_DAYS = 30;
const PROGRESS_LIMIT = 12;
const MS_IN_DAY = 1000 * 60 * 60 * 24;

type EntryWithDate = RehabEntry & { dateObj: Date };

interface StrengthProgression {
  id: string;
  title: string;
  latestLog: ExerciseEntry;
  latestDate: Date;
  weightChange: number | null;
  volumeChange: number | null;
  changeScore: number;
}

export const metadata: Metadata = {
  title: 'Knee Rehab Summary | Dedication Dashboard',
  description: 'A blacked-out statistical briefing of rehab dedication, pain trends, and strength progression.',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const toYMD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const parseWeightValue = (value?: string | null): number | null => {
  if (!value) return null;
  const numeric = value.replace(/[^\d.]/g, '');
  if (!numeric) return null;
  const parsed = Number.parseFloat(numeric);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseDurationMinutes = (value?: string | null): number => {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(part => Number.parseFloat(part));
    if (parts.some(part => Number.isNaN(part))) {
      return 0;
    }
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return hours * 60 + minutes + seconds / 60;
    }
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return minutes + seconds / 60;
    }
    return parts[0];
  }

  const minutesMatch = trimmed.match(/([\d.]+)\s*(min|minutes|m)?/i);
  if (minutesMatch) {
    const minutes = Number.parseFloat(minutesMatch[1]);
    return Number.isNaN(minutes) ? 0 : minutes;
  }

  const numeric = Number.parseFloat(trimmed.replace(/[^\d.]/g, ''));
  return Number.isNaN(numeric) ? 0 : numeric;
};

const getVolume = (exercise: ExerciseEntry): number | null => {
  if (!exercise.sets || !exercise.reps) return null;
  return exercise.sets * exercise.reps;
};

const computeEntryPainAverage = (entry: RehabEntry): number | null => {
  const pains = entry.exercises
    .map(ex => (typeof ex.painLevel === 'number' ? ex.painLevel : null))
    .filter((value): value is number => value !== null);

  return average(pains);
};

const toPercentage = (value: number, total: number): number => {
  if (total <= 0) return 0;
  return (value / total) * 100;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hasProgressSignal = (entry: ExerciseEntry): boolean =>
  Boolean(entry.weight || (entry.sets && entry.reps) || entry.timeElapsed);

const formatWorkoutLabel = (entry: RehabEntry): string => {
  if (entry.isRestDay) return 'Rest & reset';
  if (entry.exercises.length === 0) return 'Mobility + journaling';
  return `${entry.exercises.length} exercise${entry.exercises.length === 1 ? '' : 's'}`;
};

export default async function RehabSummaryPage() {
  const [exercises, entries] = await Promise.all([getExercises(), getEntries()]);

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const entriesWithDate: EntryWithDate[] = sortedEntries.map(entry => ({
    ...entry,
    dateObj: new Date(`${entry.date}T00:00:00`),
  }));

  const now = new Date();
  const todayStr = toYMD(now);
  const lookbackStart = new Date(now);
  lookbackStart.setDate(now.getDate() - LOOKBACK_DAYS);

  const windowEntries = entriesWithDate.filter(entry => entry.dateObj >= lookbackStart);
  const totalWindowDays = Math.max(
    1,
    Math.ceil((now.getTime() - lookbackStart.getTime()) / MS_IN_DAY)
  );

  const activeWindowDays =
    windowEntries.length > 0
      ? Math.max(
          1,
          Math.ceil(
            (now.getTime() -
              windowEntries.reduce(
                (earliest, entry) =>
                  entry.dateObj.getTime() < earliest ? entry.dateObj.getTime() : earliest,
                windowEntries[0].dateObj.getTime()
              )) /
              MS_IN_DAY
          ) + 1
        )
      : 1;

  const workoutEntries = windowEntries.filter(
    entry => !entry.isRestDay && entry.exercises.length > 0
  );
  const restEntries = windowEntries.filter(entry => entry.isRestDay);
  const vitaminDays = windowEntries.filter(entry => entry.vitaminsTaken).length;
  const shakeDays = windowEntries.filter(entry => entry.proteinShake).length;
  const notesLogged = windowEntries.filter(entry => Boolean(entry.notes)).length;
  const totalExerciseSessions = workoutEntries.reduce(
    (sum, entry) => sum + entry.exercises.length,
    0
  );
  const totalSets = workoutEntries.reduce(
    (sum, entry) =>
      sum + entry.exercises.reduce((setSum, exercise) => setSum + (exercise.sets ?? 0), 0),
    0
  );
  const totalReps = workoutEntries.reduce(
    (sum, entry) =>
      sum +
      entry.exercises.reduce((repSum, exercise) => {
        if (!exercise.sets || !exercise.reps) return repSum;
        return repSum + exercise.sets * exercise.reps;
      }, 0),
    0
  );
  const totalMinutes = workoutEntries.reduce(
    (sum, entry) =>
      sum +
      entry.exercises.reduce((minuteSum, exercise) => minuteSum + parseDurationMinutes(exercise.timeElapsed), 0),
    0
  );
  const bfrSessions = workoutEntries.reduce(
    (sum, entry) => sum + entry.exercises.filter(exercise => exercise.bfr).length,
    0
  );

  const workoutsPerWeek =
    workoutEntries.length > 0
      ? (workoutEntries.length / (activeWindowDays / 7)).toFixed(1)
      : '0.0';

  const avgPainOverall = average(
    workoutEntries.flatMap(entry =>
      entry.exercises
        .map(exercise =>
          typeof exercise.painLevel === 'number' ? exercise.painLevel : null
        )
        .filter((value): value is number => value !== null)
    )
  );

  const getEntriesForRange = (startDaysAgo: number, endDaysAgo: number): EntryWithDate[] =>
    windowEntries.filter(entry => {
      const diffInDays = Math.floor(
        (now.getTime() - entry.dateObj.getTime()) / MS_IN_DAY
      );
      return diffInDays >= startDaysAgo && diffInDays < endDaysAgo;
    });

  const recentPainEntries = getEntriesForRange(0, TREND_WINDOW_DAYS);
  const previousPainEntries = getEntriesForRange(
    TREND_WINDOW_DAYS,
    TREND_WINDOW_DAYS * 2
  );

  const avgPainRecent = average(
    recentPainEntries.flatMap(entry => {
      const painValues = entry.exercises
        .map(exercise =>
          typeof exercise.painLevel === 'number' ? exercise.painLevel : null
        )
        .filter((value): value is number => value !== null);
      return painValues;
    })
  );

  const avgPainPrevious = average(
    previousPainEntries.flatMap(entry => {
      const painValues = entry.exercises
        .map(exercise =>
          typeof exercise.painLevel === 'number' ? exercise.painLevel : null
        )
        .filter((value): value is number => value !== null);
      return painValues;
    })
  );

  const painDelta =
    avgPainRecent !== null && avgPainPrevious !== null
      ? avgPainRecent - avgPainPrevious
      : null;

  // Exercise-specific pain trends
  const exercisePainData = new Map<
    string,
    { recent: number[]; previous: number[] }
  >();

  recentPainEntries.forEach(entry => {
    entry.exercises.forEach(exercise => {
      if (typeof exercise.painLevel === 'number') {
        const existing = exercisePainData.get(exercise.id) ?? {
          recent: [],
          previous: [],
        };
        existing.recent.push(exercise.painLevel);
        exercisePainData.set(exercise.id, existing);
      }
    });
  });

  previousPainEntries.forEach(entry => {
    entry.exercises.forEach(exercise => {
      if (typeof exercise.painLevel === 'number') {
        const existing = exercisePainData.get(exercise.id) ?? {
          recent: [],
          previous: [],
        };
        existing.previous.push(exercise.painLevel);
        exercisePainData.set(exercise.id, existing);
      }
    });
  });

  const exercisePainTrends = Array.from(exercisePainData.entries())
    .map(([exerciseId, data]) => {
      const recentAvg = average(data.recent);
      const previousAvg = average(data.previous);
      if (recentAvg === null || previousAvg === null) return null;
      const delta = recentAvg - previousAvg;
      const exercise = exercises.find(ex => ex.id === exerciseId);
      return {
        exerciseId,
        exerciseTitle: exercise?.title ?? exerciseId,
        recentAvg,
        previousAvg,
        delta,
        sampleCount: data.recent.length + data.previous.length,
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null && Math.abs(item.delta) > 0.1 && item.sampleCount >= 3
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);

  const resilienceDays = workoutEntries.filter(entry => {
    const entryPain = computeEntryPainAverage(entry);
    return entryPain !== null && entryPain >= 5;
  }).length;

  const lowPainDays = workoutEntries.filter(entry => {
    const entryPain = computeEntryPainAverage(entry);
    return entryPain !== null && entryPain <= 3;
  }).length;

  // Habit and dedication metrics
  const trainingConsistency = toPercentage(workoutEntries.length, windowEntries.length);
  const vitaminConsistency = toPercentage(vitaminDays, windowEntries.length);
  const shakeConsistency = toPercentage(shakeDays, windowEntries.length);
  const journalingRate = toPercentage(notesLogged, windowEntries.length);
  const restDiscipline = toPercentage(restEntries.length, windowEntries.length);
  const effortLoad =
    workoutEntries.length > 0
      ? clamp((totalSets / workoutEntries.length) * 14, 0, 100)
      : 0;
  const dedicationIndex = Math.round(
    trainingConsistency * 0.5 + effortLoad * 0.3 + ((vitaminConsistency + shakeConsistency) / 2) * 0.2
  );

  // Streaks
  const loggedDateSet = new Set(windowEntries.map(entry => entry.date));
  let currentStreak = 0;
  const cursor = new Date(`${todayStr}T00:00:00`);
  // Avoid infinite loops by capping to lookback days
  for (let i = 0; i <= LOOKBACK_DAYS; i += 1) {
    const cursorKey = toYMD(cursor);
    if (!loggedDateSet.has(cursorKey)) {
      break;
    }
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let longestStreak = 0;
  let streakCounter = 0;
  let previousDate: Date | null = null;
  const chronologicalEntries = [...windowEntries].sort(
    (a, b) => a.dateObj.getTime() - b.dateObj.getTime()
  );
  chronologicalEntries.forEach(entry => {
    if (!previousDate) {
      streakCounter = 1;
      longestStreak = Math.max(longestStreak, streakCounter);
      previousDate = entry.dateObj;
      return;
    }
    const diff = Math.floor(
      (entry.dateObj.getTime() - previousDate.getTime()) / MS_IN_DAY
    );
    if (diff === 0) {
      return;
    }
    if (diff === 1) {
      streakCounter += 1;
    } else {
      streakCounter = 1;
    }
    longestStreak = Math.max(longestStreak, streakCounter);
    previousDate = entry.dateObj;
  });

  // Strength progressions
  const exerciseLogs = new Map<
    string,
    { log: ExerciseEntry; date: Date }[]
  >();

  entriesWithDate.forEach(entry => {
    entry.exercises.forEach(log => {
      const existing = exerciseLogs.get(log.id) ?? [];
      existing.push({ log, date: entry.dateObj });
      exerciseLogs.set(log.id, existing);
    });
  });

  const strengthProgress: StrengthProgression[] = exercises.flatMap(exercise => {
    const logs = exerciseLogs.get(exercise.id);
    if (!logs || logs.length === 0) {
      return [];
    }
    const ordered = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
    const meaningful = ordered.filter(item => hasProgressSignal(item.log));
    if (meaningful.length === 0) {
      return [];
    }

    const earliest = meaningful[0];
    const latest = meaningful[meaningful.length - 1];
    const weightChange =
      parseWeightValue(earliest.log.weight) !== null &&
      parseWeightValue(latest.log.weight) !== null
        ? (parseWeightValue(latest.log.weight) ?? 0) -
          (parseWeightValue(earliest.log.weight) ?? 0)
        : null;
    const volumeChange =
      getVolume(earliest.log) !== null && getVolume(latest.log) !== null
        ? (getVolume(latest.log) ?? 0) - (getVolume(earliest.log) ?? 0)
        : null;

    // Only keep progressions that are trending up in load/volume
    const hasPositiveChange =
      (weightChange ?? 0) > 0 || (volumeChange ?? 0) > 0;
    if (!hasPositiveChange) {
      return [];
    }

    const changeScore =
      (weightChange ?? 0) * 6 + (volumeChange ?? 0) * 0.75 + (latest.log.sets ?? 0);

    return [
      {
        id: exercise.id,
        title: exercise.title,
        latestLog: latest.log,
        latestDate: latest.date,
        weightChange,
        volumeChange,
        changeScore,
      },
    ];
  });

  const topProgressions = strengthProgress
    .sort((a, b) => b.changeScore - a.changeScore)
    .slice(0, PROGRESS_LIMIT);

  const insightItems: string[] = [];

  if (workoutEntries.length > 0) {
    insightItems.push(
      `${workoutEntries.length} training days logged with ${workoutsPerWeek} sessions/week pace.`
    );
  }
  if (painDelta !== null) {
    insightItems.push(
      `Pain levels ${painDelta < 0 ? 'down' : 'up'} ${Math.abs(painDelta).toFixed(
        1
      )} vs prior month.`
    );
  }
  if (topProgressions[0]) {
    const primary = topProgressions[0];
    const changeLabel =
      primary.weightChange !== null && primary.weightChange !== 0
        ? `${primary.weightChange > 0 ? '+' : ''}${primary.weightChange.toFixed(1)} load units`
        : primary.volumeChange !== null && primary.volumeChange !== 0
          ? `${primary.volumeChange > 0 ? '+' : ''}${primary.volumeChange} reps volume`
          : 'consistent output';
    insightItems.push(`${primary.title} ${changeLabel}.`);
  }

  const painTimeline = recentPainEntries
    .filter(entry => computeEntryPainAverage(entry) !== null)
    .slice(0, 12)
    .map(entry => ({
      date: entry.dateObj,
      value: computeEntryPainAverage(entry),
      workout: !entry.isRestDay,
    }));

  // Intensity heatmap data for 30-day window (including today)
  const heatmapStartDate = new Date(now);
  heatmapStartDate.setDate(now.getDate() - (TREND_WINDOW_DAYS - 1));
  
  const entriesByDate = new Map<string, EntryWithDate>();
  windowEntries.forEach(entry => {
    entriesByDate.set(entry.date, entry);
  });

  const heatmapData: Array<{
    date: Date;
    dateStr: string;
    intensity: number;
    entry: EntryWithDate | null;
  }> = [];

  for (let i = 0; i < TREND_WINDOW_DAYS; i += 1) {
    const currentDate = new Date(heatmapStartDate);
    currentDate.setDate(heatmapStartDate.getDate() + i);
    const dateStr = toYMD(currentDate);
    const entry = entriesByDate.get(dateStr) ?? null;

    let intensity = 0;
    if (entry) {
      if (entry.isRestDay) {
        intensity = 0.1; // Low intensity for rest days
      } else {
        const exerciseCount = entry.exercises.length;
        const totalSets = entry.exercises.reduce(
          (sum, ex) => sum + (ex.sets ?? 0),
          0
        );
        const totalMinutes = entry.exercises.reduce(
          (sum, ex) => sum + parseDurationMinutes(ex.timeElapsed),
          0
        );
        
        // Normalize and combine factors (max values: ~10 exercises, ~30 sets, ~60 min)
        const exerciseScore = Math.min(exerciseCount / 10, 1);
        const setsScore = Math.min(totalSets / 30, 1);
        const timeScore = Math.min(totalMinutes / 60, 1);
        
        // Weighted combination
        intensity = (exerciseScore * 0.4 + setsScore * 0.4 + timeScore * 0.2);
      }
    }

    heatmapData.push({
      date: currentDate,
      dateStr,
      intensity,
      entry,
    });
  }

  // Organize heatmap data into weeks with Sunday on the left
  const organizedHeatmapData: Array<{
    date: Date;
    dateStr: string;
    intensity: number;
    entry: EntryWithDate | null;
  }> = [];
  
  // Find the first Sunday before or on the start date
  const firstDate = heatmapData[0]?.date;
  if (firstDate) {
    const firstDayOfWeek = firstDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToSubtract = firstDayOfWeek; // Days to go back to reach Sunday
    
    // Add empty cells for days before the start date to align with Sunday
    for (let i = daysToSubtract - 1; i >= 0; i -= 1) {
      const emptyDate = new Date(firstDate);
      emptyDate.setDate(firstDate.getDate() - (i + 1));
      organizedHeatmapData.push({
        date: emptyDate,
        dateStr: toYMD(emptyDate),
        intensity: 0,
        entry: null,
      });
    }
  }
  
  // Add all the actual data
  organizedHeatmapData.push(...heatmapData);

  const hasData = windowEntries.length > 0;

  return (
    <div className={cx('rehab-summary-page', pageWrapper)}>
      <div className={cx('rehab-summary-container', pageContainer)}>
      <Link href="/tools/knee-rehab" className={cx('rehab-summary-back-link', backLink)}>
        ← Back to Knee Rehab
      </Link>
      <header className={cx('rehab-summary-header', headerWrapper)}>
        <div className="rehab-summary-header-content">
          <p className={cx('rehab-summary-eyebrow', eyebrowText)}>Knee Rehab · Statistical Briefing</p>
          <h1 className={cx('rehab-summary-title', pageTitle)}>Dedication Pulse</h1>
          <p className={cx('rehab-summary-subtitle', subtitle)}>
            {hasData
              ? `Rolling ${LOOKBACK_DAYS}-day window · ${workoutEntries.length} training days · ${totalExerciseSessions} individual sessions logged.`
              : 'No rehab entries yet — log a session to unlock insights.'}
          </p>
          {insightItems.length > 0 && (
            <ul className={cx('rehab-summary-insights', insightsList)}>
              {insightItems.map(item => (
                <li key={item} className="rehab-summary-insight-item">{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={cx('rehab-summary-badges', headerBadgeStack)}>
          <div className={cx('rehab-summary-badge-current-streak', badgeCard)}>
            <span className={cx('rehab-summary-badge-label', badgeLabel)}>Current streak</span>
            <strong className={cx('rehab-summary-badge-value', badgeValue)}>{currentStreak}d</strong>
          </div>
          <div className={cx('rehab-summary-badge-longest-streak', badgeCard)}>
            <span className={cx('rehab-summary-badge-label', badgeLabel)}>Longest streak</span>
            <strong className={cx('rehab-summary-badge-value', badgeValue)}>{longestStreak}d</strong>
          </div>
          <div className={cx('rehab-summary-badge-bfr-focus', badgeCard)}>
            <span className={cx('rehab-summary-badge-label', badgeLabel)}>BFR focus</span>
            <strong className={cx('rehab-summary-badge-value', badgeValue)}>{bfrSessions}</strong>
          </div>
        </div>
      </header>

      <section className={cx('rehab-summary-section-momentum', sectionBlock)}>
        <div className={cx('rehab-summary-section-header', sectionHeader)}>
          <h2>Momentum Metrics</h2>
          <span>Discipline snapshot</span>
        </div>
        <div className={cx('rehab-summary-momentum-grid', statGrid)}>
          <div className={cx('rehab-summary-stat-workouts-logged', statCard)}>
            <p className={cx('rehab-summary-stat-label', statLabel)}>Workouts logged</p>
            <div className={cx('rehab-summary-stat-value-row', statValueRow)}>
              <span className={cx('rehab-summary-stat-value', statValue)}>{workoutEntries.length}</span>
              <span className={cx('rehab-summary-stat-delta', statDelta)}>{workoutsPerWeek} / wk</span>
            </div>
            <p className={cx('rehab-summary-stat-description', statDescription)}>Frequency over {LOOKBACK_DAYS} days</p>
          </div>

          <div className={cx('rehab-summary-stat-dedication-index', statCard)}>
            <p className={cx('rehab-summary-stat-label', statLabel)}>Dedication index</p>
            <div className={cx('rehab-summary-stat-value-row', statValueRow)}>
              <span className={cx('rehab-summary-stat-value', statValue)}>{dedicationIndex}</span>
              <span className={cx('rehab-summary-stat-delta-positive', statDeltaPositive)}>
                {trainingConsistency.toFixed(0)}% adherence
              </span>
            </div>
            <p className={cx('rehab-summary-stat-description', statDescription)}>Training + recovery + habits</p>
          </div>

          <div className={cx('rehab-summary-stat-total-sets', statCard)}>
            <p className={cx('rehab-summary-stat-label', statLabel)}>Total sets</p>
            <div className={cx('rehab-summary-stat-value-row', statValueRow)}>
              <span className={cx('rehab-summary-stat-value', statValue)}>{totalSets}</span>
              <span className={cx('rehab-summary-stat-delta-neutral', statDeltaNeutral)}>{totalReps} reps</span>
            </div>
            <p className={cx('rehab-summary-stat-description', statDescription)}>
              {Math.round(totalMinutes)} min under tension
            </p>
          </div>

          <div className={cx('rehab-summary-stat-exercise-sessions', statCard)}>
            <p className={cx('rehab-summary-stat-label', statLabel)}>Exercise sessions</p>
            <div className={cx('rehab-summary-stat-value-row', statValueRow)}>
              <span className={cx('rehab-summary-stat-value', statValue)}>{totalExerciseSessions}</span>
              <span className={cx('rehab-summary-stat-delta-neutral', statDeltaNeutral)}>
                {workoutEntries.length > 0
                  ? (totalExerciseSessions / workoutEntries.length).toFixed(1)
                  : '0.0'}{' '}
                per workout
              </span>
            </div>
            <p className={cx('rehab-summary-stat-description', statDescription)}>Individual exercises logged</p>
          </div>
        </div>
      </section>

      <section className={cx('rehab-summary-section-pain-recovery', sectionBlock)}>
        <div className={cx('rehab-summary-section-header', sectionHeader)}>
          <h2>Pain & Recovery</h2>
          <span>Trend vs prior {TREND_WINDOW_DAYS} days</span>
        </div>
        <div className={cx('rehab-summary-pain-grid', painGrid)}>
          <div className={cx('rehab-summary-pain-average-card', statCard)}>
            <p className={cx('rehab-summary-stat-label', statLabel)}>Average pain</p>
            <div className={cx('rehab-summary-stat-value-row', statValueRow)}>
              <span className={cx('rehab-summary-stat-value', statValue)}>
                {avgPainRecent !== null ? avgPainRecent.toFixed(1) : '—'}
              </span>
              {painDelta !== null && (
                <span className={cx('rehab-summary-pain-delta', painDelta < 0 ? statDeltaPositive : statDeltaNegative)}>
                  {painDelta < 0 ? '▼' : '▲'} {Math.abs(painDelta).toFixed(1)}
                </span>
              )}
            </div>
            <p className={cx('rehab-summary-stat-description', statDescription)}>
              Prev window {avgPainPrevious !== null ? avgPainPrevious.toFixed(1) : '—'}/10
            </p>
          </div>

          <div className={cx('rehab-summary-pain-timeline-card', timelineCard)}>
            <p className={cx('rehab-summary-stat-label', statLabel)}>Recent signals</p>
            {painTimeline.length === 0 ? (
              <p className={cx('rehab-summary-stat-description', statDescription)}>Log pain scores to unlock this view.</p>
            ) : (
              <div className={cx('rehab-summary-pain-timeline-list', timelineList)}>
                {painTimeline.map(item => (
                  <div key={item.date.toISOString()} className={cx('rehab-summary-pain-timeline-row', timelineRow)}>
                    <span className="rehab-summary-pain-timeline-date">{formatDisplayDate(item.date)}</span>
                    <div
                      className={cx('rehab-summary-pain-timeline-bar', timelineBar)}
                      style={{ '--fill': `${((item.value ?? 0) / 10) * 100}%` } as CSSProperties}
                    >
                      <span className={cx('rehab-summary-pain-timeline-bar-glow', timelineBarGlow)} />
                    </div>
                    <span className={cx('rehab-summary-pain-timeline-value', timelineValue)}>
                      {item.value !== null ? item.value.toFixed(1) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {exercisePainTrends.length > 0 && (
          <div className={cx('rehab-summary-exercise-pain-trends-grid', exerciseTrendGrid)}>
            {exercisePainTrends.map(trend => (
              <div key={trend.exerciseId} className={cx('rehab-summary-exercise-pain-trend-card', statCard)}>
                <p className={cx('rehab-summary-stat-label', statLabel)}>{trend.exerciseTitle}</p>
                <div className={cx('rehab-summary-stat-value-row', statValueRow)}>
                  <span className={cx('rehab-summary-stat-value', statValue)}>
                    {trend.recentAvg.toFixed(1)}
                  </span>
                  <span
                    className={cx('rehab-summary-exercise-pain-trend-delta', trend.delta < 0 ? statDeltaPositive : statDeltaNegative)}
                  >
                    {trend.delta < 0 ? '▼' : '▲'} {Math.abs(trend.delta).toFixed(1)}
                  </span>
                </div>
                <p className={cx('rehab-summary-stat-description', statDescription)}>
                  Prev {trend.previousAvg.toFixed(1)}/10 · {trend.sampleCount} samples
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cx('rehab-summary-section-strength-progress', sectionBlock)}>
        <div className={cx('rehab-summary-section-header', sectionHeader)}>
          <h2>Strength Progress Signals</h2>
          <span>Top movers across all exercises</span>
        </div>
        <div className={cx('rehab-summary-strength-progress-grid', progressGrid)}>
          {topProgressions.length === 0 ? (
            <p className={cx('rehab-summary-stat-description', statDescription)}>Log sets, reps, or load to track progression.</p>
          ) : (
            topProgressions.map(progress => {
              const changeLabel =
                progress.weightChange !== null && progress.weightChange > 0
                  ? `+${progress.weightChange.toFixed(1)} load`
                  : progress.volumeChange !== null && progress.volumeChange > 0
                    ? `+${progress.volumeChange} reps`
                    : 'loading up';
              const detailParts: string[] = [];
              if (progress.latestLog.weight) detailParts.push(`${progress.latestLog.weight} lbs`);
              if (progress.latestLog.sets && progress.latestLog.reps) {
                detailParts.push(`${progress.latestLog.sets}x${progress.latestLog.reps}`);
              }
              if (progress.latestLog.timeElapsed) {
                detailParts.push(progress.latestLog.timeElapsed);
              }

              return (
                <div key={progress.id} className={cx('rehab-summary-strength-progress-card', progressCard)}>
                  <p className={cx('rehab-summary-strength-progress-title', progressTitle)}>{progress.title}</p>
                  <div className={cx('rehab-summary-strength-progress-value-row', progressValueRow)}>
                    <span className={cx('rehab-summary-strength-progress-value', progressValue)}>{changeLabel}</span>
                    <span className={cx('rehab-summary-strength-progress-meta', progressMeta)}>
                      Last: {formatDisplayDate(progress.latestDate)}
                    </span>
                  </div>
                  <p className={cx('rehab-summary-strength-progress-details', progressDetails)}>
                    {detailParts.length > 0 ? detailParts.join(' • ') : 'No specifics logged'}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className={cx('rehab-summary-section-lifestyle-heatmap', sectionBlock)}>
        <div className={cx('rehab-summary-lifestyle-heatmap-grid', lifestyleHeatmapGrid)}>
          <div className={cx('rehab-summary-lifestyle-section', lifestyleSection)}>
            <div className={cx('rehab-summary-section-header', sectionHeader)}>
              <h2>Lifestyle Consistency</h2>
              <span>Healthy living scoreboard</span>
            </div>
            <div className={cx('rehab-summary-lifestyle-habits-grid', habitGrid)}>
              <div className={cx('rehab-summary-habit-vitamin-adherence', habitCard)}>
                <p className={cx('rehab-summary-habit-label', habitLabel)}>Vitamin adherence</p>
                <p className={cx('rehab-summary-habit-value', habitValue)}>{vitaminConsistency.toFixed(0)}%</p>
                <p className={cx('rehab-summary-habit-description', habitDescription)}>
                  {vitaminDays} of {windowEntries.length} days
                </p>
              </div>
              <div className={cx('rehab-summary-habit-fuel-routine', habitCard)}>
                <p className={cx('rehab-summary-habit-label', habitLabel)}>Fuel routine</p>
                <p className={cx('rehab-summary-habit-value', habitValue)}>{shakeConsistency.toFixed(0)}%</p>
                <p className={cx('rehab-summary-habit-description', habitDescription)}>
                  {shakeDays} of {windowEntries.length} days
                </p>
              </div>
              <div className={cx('rehab-summary-habit-mindset-notes', habitCard)}>
                <p className={cx('rehab-summary-habit-label', habitLabel)}>Mindset notes</p>
                <p className={cx('rehab-summary-habit-value', habitValue)}>{journalingRate.toFixed(0)}%</p>
                <p className={cx('rehab-summary-habit-description', habitDescription)}>
                  {notesLogged} of {windowEntries.length} days
                </p>
              </div>
              <div className={cx('rehab-summary-habit-deload-discipline', habitCard)}>
                <p className={cx('rehab-summary-habit-label', habitLabel)}>Deload discipline</p>
                <p className={cx('rehab-summary-habit-value', habitValue)}>{restDiscipline.toFixed(0)}%</p>
                <p className={cx('rehab-summary-habit-description', habitDescription)}>
                  {restEntries.length} of {windowEntries.length} days
                </p>
              </div>
            </div>
          </div>
          <div className={cx('rehab-summary-heatmap-section', heatmapSection)}>
            <div className={cx('rehab-summary-section-header', sectionHeader)}>
              <h2>Activity Heatmap</h2>
              <span>30-day intensity overview</span>
            </div>
            {!hasData ? (
              <p className={cx('rehab-summary-stat-description', statDescription)}>No activity yet. Your next entry will appear here.</p>
            ) : (
              <div className={cx('rehab-summary-heatmap-container', heatmapContainer)}>
                <div className={cx('rehab-summary-heatmap-grid', heatmapGrid)}>
                  {organizedHeatmapData.map(day => {
                    const isToday = day.dateStr === todayStr;
                    const intensityPercent = Math.round(day.intensity * 100);
                    const isRestDay = day.entry?.isRestDay ?? false;
                    const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                    const dayNumber = day.date.getDate().toString();
                    
                    // Calculate transparent-to-green color: transparent (low) to vibrant green (high)
                    // GitHub-style vibrant green: rgb(22, 163, 74) or similar
                    // Opacity scales from 0 (transparent) to 0.8 (vibrant green)
                    const greenR = 22;
                    const greenG = 163;
                    const greenB = 74;
                    const opacity = day.entry ? day.intensity * 0.8 : 0; // 0 to 0.8 based on intensity
                    
                    return (
                      <Link
                        key={day.dateStr}
                        href={`/tools/knee-rehab?date=${day.dateStr}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cx('rehab-summary-heatmap-cell', heatmapCell)}
                        style={{
                          '--intensity': day.intensity,
                          '--opacity': day.entry ? 1 : 0.3,
                          '--cell-color': day.entry 
                            ? `rgba(${greenR}, ${greenG}, ${greenB}, ${opacity})`
                            : 'transparent',
                        } as CSSProperties}
                      >
                        <div className={cx('rehab-summary-heatmap-cell-content', heatmapCellContent)}>
                          <span className={cx('rehab-summary-heatmap-cell-day-name', heatmapCellDayName)}>{dayName}</span>
                          <span className={cx('rehab-summary-heatmap-cell-date', heatmapCellDate)}>{dayNumber}</span>
                          {isRestDay && (
                            <span className={cx('rehab-summary-heatmap-cell-rest-day', heatmapCellRestDay)}>😴</span>
                          )}
                        </div>
                        {isToday && <span className={cx('rehab-summary-heatmap-today-indicator', heatmapTodayIndicator)} />}
                      </Link>
                    );
                  })}
                </div>
                <div className={cx('rehab-summary-heatmap-legend', heatmapLegend)}>
                  <span className={cx('rehab-summary-heatmap-legend-label', heatmapLegendLabel)}>Less</span>
                  <div className={cx('rehab-summary-heatmap-legend-gradient', heatmapLegendGradient)} />
                  <span className={cx('rehab-summary-heatmap-legend-label', heatmapLegendLabel)}>More</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}

const pageWrapper = css({
  minHeight: '100vh',
  background: 'radial-gradient(circle at top, rgba(88, 166, 255, 0.15), transparent 55%) #050505',
  color: '#f5f5f5',
  padding: { base: '2.5rem 1.5rem 4rem', md: '3.5rem 2.5rem 5rem' },
  display: 'flex',
  flexDirection: 'column',
  gap: '2.5rem',
});

const pageContainer = css({
  width: '100%',
  maxWidth: '1400px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '5rem',
});

const backLink = css({
  color: '#94a3b8',
  fontSize: '0.9rem',
  textDecoration: 'none',
  marginBottom: '1rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  transition: 'color 0.2s',
  alignSelf: 'flex-start',

  '&:hover': {
    color: '#cbd5f5',
  },
});

const headerWrapper = css({
  display: 'flex',
  flexDirection: { base: 'column', lg: 'row' },
  justifyContent: 'space-between',
  gap: '1.5rem',
});

const eyebrowText = css({
  textTransform: 'uppercase',
  letterSpacing: '0.3em',
  fontSize: '0.75rem',
  color: '#9ca3af',
  marginBottom: '0.5rem',
});

const pageTitle = css({
  fontSize: { base: '2.25rem', md: '2.75rem' },
  fontWeight: 700,
  color: '#f8fafc',
  marginBottom: '0.5rem',
});

const subtitle = css({
  fontSize: '1rem',
  color: '#94a3b8',
});

const insightsList = css({
  marginTop: '1rem',
  paddingLeft: '1.2rem',
  color: '#cbd5f5',
  fontSize: '0.95rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});

const headerBadgeStack = css({
  display: 'grid',
  gridTemplateColumns: {
    base: 'repeat(3, minmax(0, 1fr))',
  },
  gap: '0.75rem',
  alignSelf: { base: 'stretch', lg: 'flex-start' },
  width: { base: '100%', lg: 'auto' },
  justifySelf: { lg: 'flex-end' },
});

const badgeCard = css({
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  padding: '0.85rem 1rem',
  background: 'rgba(15, 23, 42, 0.35)',
  backdropFilter: 'blur(12px)',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
});

const badgeLabel = css({
  fontSize: '0.75rem',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '0.5rem',
});

const badgeValue = css({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#f8fafc',
});

const sectionBlock = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
});

const sectionHeader = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  borderBottom: '1px solid rgba(148, 163, 184, 0.35)',
  paddingBottom: '0.5rem',
  color: '#e2e8f0',

  '& h2': {
    fontSize: '1.2rem',
    fontWeight: 600,
  },

  '& span': {
    fontSize: '0.85rem',
    color: '#94a3b8',
  },
});

const statGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: 'repeat(1, minmax(0, 1fr))', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
  gap: '1rem',
});

const statCard = css({
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  padding: '1.25rem',
  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.65), rgba(2, 6, 23, 0.85))',
  boxShadow: '0 15px 30px rgba(0, 0, 0, 0.35)',
});

const statLabel = css({
  fontSize: '0.85rem',
  color: '#94a3b8',
  marginBottom: '0.65rem',
});

const statValueRow = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.4rem',
});

const statValue = css({
  fontSize: '2rem',
  fontWeight: 700,
  color: '#f8fafc',
});

const statDelta = css({
  fontSize: '0.95rem',
  color: '#38bdf8',
  fontWeight: 600,
});

const statDeltaPositive = css({
  fontSize: '0.95rem',
  color: '#22c55e',
  fontWeight: 600,
});

const statDeltaNegative = css({
  fontSize: '0.95rem',
  color: '#f97316',
  fontWeight: 600,
});

const statDeltaNeutral = css({
  fontSize: '0.95rem',
  color: '#94a3b8',
  fontWeight: 600,
});

const statDescription = css({
  fontSize: '0.85rem',
  color: '#94a3b8',
});

const painGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', lg: '420px 1fr' },
  gap: '1rem',
});

const exerciseTrendGrid = css({
  display: 'grid',
  gridTemplateColumns: {
    base: 'repeat(1, minmax(0, 1fr))',
    md: 'repeat(2, minmax(0, 1fr))',
    lg: 'repeat(3, minmax(0, 1fr))',
  },
  gap: '1rem',
  marginTop: '1rem',
});

const timelineCard = css({
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  padding: '1.25rem',
  background: 'rgba(2, 6, 23, 0.65)',
  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.35)',
});

const timelineList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
  marginTop: '0.75rem',
});

const timelineRow = css({
  display: 'grid',
  gridTemplateColumns: '90px 1fr 50px',
  alignItems: 'center',
  fontSize: '0.85rem',
  color: '#cbd5f5',
  gap: '0.5rem',
});

const timelineBar = css({
  position: 'relative',
  width: '100%',
  height: '0.35rem',
  borderRadius: '999px',
  background: 'rgba(57, 72, 103, 0.6)',
  overflow: 'hidden',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    width: 'var(--fill)',
    backgroundImage: 'linear-gradient(90deg, #22d3ee, #a855f7)',
  },
});

const timelineBarGlow = css({
  position: 'absolute',
  inset: 0,
  boxShadow: '0 0 30px rgba(168, 85, 247, 0.25)',
});

const timelineValue = css({
  textAlign: 'right',
  fontWeight: 600,
});

const progressGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'repeat(auto-fit, minmax(240px, 1fr))' },
  gap: '1rem',
});

const progressCard = css({
  borderRadius: '16px',
  border: '1px solid rgba(88, 166, 255, 0.2)',
  padding: '1.1rem',
  background: 'rgba(8, 47, 73, 0.45)',
});

const progressTitle = css({
  fontSize: '1rem',
  fontWeight: 600,
  color: '#f0f9ff',
});

const progressValueRow = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  margin: '0.25rem 0 0.5rem',
});

const progressValue = css({
  fontSize: '1.45rem',
  fontWeight: 700,
  color: '#22c55e',
});

const progressMeta = css({
  fontSize: '0.8rem',
  color: '#bae6fd',
});

const progressDetails = css({
  fontSize: '0.85rem',
  color: '#e0f2fe',
});

const habitGrid = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.8rem',
  paddingTop: '0.5rem',
});

const habitCard = css({
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  padding: '1rem',
  background: 'rgba(15, 23, 42, 0.55)',
});

const habitLabel = css({
  fontSize: '0.85rem',
  color: '#cbd5f5',
});

const habitValue = css({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#f8fafc',
});

const habitDescription = css({
  fontSize: '0.8rem',
  color: '#94a3b8',
});

const lifestyleHeatmapGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', lg: '420px 1fr' },
  gap: '1.5rem',
  alignItems: 'flex-start',
});

const lifestyleSection = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

const heatmapSection = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

const heatmapContainer = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  paddingTop: '0.5rem',
});

const heatmapGrid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: '0.4rem',
});

const heatmapCell = css({
  aspectRatio: '1',
  borderRadius: '6px',
  background: 'var(--cell-color, transparent)',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  position: 'relative',
  transition: 'transform 0.2s, box-shadow 0.2s',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  color: 'inherit',
  minHeight: '32px',
  fontSize: '0.7rem',

  '&:hover': {
    transform: 'scale(1.05)',
    boxShadow: '0 0 12px rgba(34, 197, 94, 0.4)',
    zIndex: 1,
  },
});

const heatmapCellContent = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0',
  position: 'relative',
  zIndex: 1,
  width: '100%',
  height: '100%',
  padding: '4px',
});

const heatmapCellDayName = css({
  fontSize: '0.65rem',
  fontWeight: 600,
  color: '#999',
  letterSpacing: '0.5px',
  lineHeight: 1,
  marginBottom: '2px',
  opacity: 'var(--opacity, 0.3)',
});

const heatmapCellDate = css({
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#ededed',
  lineHeight: 1,
  opacity: 'var(--opacity, 0.3)',
});

const heatmapCellRestDay = css({
  fontSize: '0.9rem',
  lineHeight: 1,
  marginTop: '2px',
  opacity: 'var(--opacity, 0.3)',
});

const heatmapTodayIndicator = css({
  position: 'absolute',
  inset: '1px',
  borderRadius: '5px',
  border: '2px solid #f8fafc',
  pointerEvents: 'none',
  zIndex: 2,
});

const heatmapLegend = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  justifyContent: 'center',
  marginTop: '0.5rem',
});

const heatmapLegendLabel = css({
  fontSize: '0.75rem',
  color: '#94a3b8',
});

const heatmapLegendGradient = css({
  width: '200px',
  height: '12px',
  borderRadius: '6px',
  background: 'linear-gradient(to right, transparent, rgba(22, 163, 74, 0.8))',
  border: '1px solid rgba(148, 163, 184, 0.15)',
});

