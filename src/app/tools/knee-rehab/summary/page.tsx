import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { css } from '@styled-system/css';
import { getEntries, getExercises } from '@/lib/kv';
import type { ExerciseEntry, RehabEntry } from '@/types';

const LOOKBACK_DAYS = 120;
const TREND_WINDOW_DAYS = 30;
const HIGHLIGHTS_LIMIT = 6;
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
      ? (workoutEntries.length / (totalWindowDays / 7)).toFixed(1)
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
    .slice(0, 3);

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

  const highlightEntries = windowEntries.slice(0, HIGHLIGHTS_LIMIT);
  const hasData = windowEntries.length > 0;

  return (
    <div className={pageWrapper}>
      <header className={headerWrapper}>
        <div>
          <p className={eyebrowText}>Knee Rehab · Statistical Briefing</p>
          <h1 className={pageTitle}>Dedication Pulse</h1>
          <p className={subtitle}>
            {hasData
              ? `Rolling ${LOOKBACK_DAYS}-day window · ${workoutEntries.length} training days · ${totalExerciseSessions} individual sessions logged.`
              : 'No rehab entries yet — log a session to unlock insights.'}
          </p>
          {insightItems.length > 0 && (
            <ul className={insightsList}>
              {insightItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={headerBadgeStack}>
          <div className={badgeCard}>
            <span className={badgeLabel}>Current streak</span>
            <strong className={badgeValue}>{currentStreak}d</strong>
          </div>
          <div className={badgeCard}>
            <span className={badgeLabel}>Longest streak</span>
            <strong className={badgeValue}>{longestStreak}d</strong>
          </div>
          <div className={badgeCard}>
            <span className={badgeLabel}>BFR focus</span>
            <strong className={badgeValue}>{bfrSessions}</strong>
          </div>
        </div>
      </header>

      <section className={sectionBlock}>
        <div className={sectionHeader}>
          <h2>Momentum Metrics</h2>
          <span>Discipline snapshot</span>
        </div>
        <div className={statGrid}>
          <div className={statCard}>
            <p className={statLabel}>Workouts logged</p>
            <div className={statValueRow}>
              <span className={statValue}>{workoutEntries.length}</span>
              <span className={statDelta}>{workoutsPerWeek} / wk</span>
            </div>
            <p className={statDescription}>Frequency over {LOOKBACK_DAYS} days</p>
          </div>

          <div className={statCard}>
            <p className={statLabel}>Dedication index</p>
            <div className={statValueRow}>
              <span className={statValue}>{dedicationIndex}</span>
              <span className={statDeltaPositive}>
                {trainingConsistency.toFixed(0)}% adherence
              </span>
            </div>
            <p className={statDescription}>Training + recovery + habits</p>
          </div>

          <div className={statCard}>
            <p className={statLabel}>Total sets</p>
            <div className={statValueRow}>
              <span className={statValue}>{totalSets}</span>
              <span className={statDeltaNeutral}>{totalReps} reps</span>
            </div>
            <p className={statDescription}>
              {Math.round(totalMinutes)} min under tension
            </p>
          </div>

          <div className={statCard}>
            <p className={statLabel}>Pain resilience</p>
            <div className={statValueRow}>
              <span className={statValue}>{resilienceDays}</span>
              <span className={statDeltaNegative}>
                {lowPainDays} easy days
              </span>
            </div>
            <p className={statDescription}>Avg pain {avgPainOverall?.toFixed(1) ?? '—'}/10</p>
          </div>
        </div>
      </section>

      <section className={sectionBlock}>
        <div className={sectionHeader}>
          <h2>Pain & Recovery</h2>
          <span>Trend vs prior {TREND_WINDOW_DAYS} days</span>
        </div>
        <div className={painGrid}>
          <div className={statCard}>
            <p className={statLabel}>Average pain</p>
            <div className={statValueRow}>
              <span className={statValue}>
                {avgPainRecent !== null ? avgPainRecent.toFixed(1) : '—'}
              </span>
              {painDelta !== null && (
                <span className={painDelta < 0 ? statDeltaPositive : statDeltaNegative}>
                  {painDelta < 0 ? '▼' : '▲'} {Math.abs(painDelta).toFixed(1)}
                </span>
              )}
            </div>
            <p className={statDescription}>
              Prev window {avgPainPrevious !== null ? avgPainPrevious.toFixed(1) : '—'}/10
            </p>
          </div>

          <div className={timelineCard}>
            <p className={statLabel}>Recent signals</p>
            {painTimeline.length === 0 ? (
              <p className={statDescription}>Log pain scores to unlock this view.</p>
            ) : (
              <div className={timelineList}>
                {painTimeline.map(item => (
                  <div key={item.date.toISOString()} className={timelineRow}>
                    <span>{formatDisplayDate(item.date)}</span>
                    <div
                      className={timelineBar}
                      style={{ '--fill': `${((item.value ?? 0) / 10) * 100}%` } as CSSProperties}
                    >
                      <span className={timelineBarGlow} />
                    </div>
                    <span className={timelineValue}>
                      {item.value !== null ? item.value.toFixed(1) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={sectionBlock}>
        <div className={sectionHeader}>
          <h2>Strength Progress Signals</h2>
          <span>Top movers across all exercises</span>
        </div>
        <div className={progressGrid}>
          {topProgressions.length === 0 ? (
            <p className={statDescription}>Log sets, reps, or load to track progression.</p>
          ) : (
            topProgressions.map(progress => {
              const changeLabel =
                progress.weightChange !== null && progress.weightChange !== 0
                  ? `${progress.weightChange > 0 ? '+' : ''}${progress.weightChange.toFixed(1)} load`
                  : progress.volumeChange !== null && progress.volumeChange !== 0
                    ? `${progress.volumeChange > 0 ? '+' : ''}${progress.volumeChange} reps`
                    : 'steady output';
              const detailParts: string[] = [];
              if (progress.latestLog.weight) detailParts.push(progress.latestLog.weight);
              if (progress.latestLog.sets && progress.latestLog.reps) {
                detailParts.push(`${progress.latestLog.sets}x${progress.latestLog.reps}`);
              }
              if (progress.latestLog.timeElapsed) {
                detailParts.push(progress.latestLog.timeElapsed);
              }

              return (
                <div key={progress.id} className={progressCard}>
                  <p className={progressTitle}>{progress.title}</p>
                  <div className={progressValueRow}>
                    <span className={progressValue}>{changeLabel}</span>
                    <span className={progressMeta}>
                      Last: {formatDisplayDate(progress.latestDate)}
                    </span>
                  </div>
                  <p className={progressDetails}>
                    {detailParts.length > 0 ? detailParts.join(' • ') : 'No specifics logged'}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className={sectionBlock}>
        <div className={sectionHeader}>
          <h2>Lifestyle Consistency</h2>
          <span>Healthy living scoreboard</span>
        </div>
        <div className={habitGrid}>
          <div className={habitCard}>
            <p className={habitLabel}>Vitamin adherence</p>
            <p className={habitValue}>{vitaminConsistency.toFixed(0)}%</p>
            <p className={habitDescription}>{vitaminDays} days logged</p>
          </div>
          <div className={habitCard}>
            <p className={habitLabel}>Fuel routine</p>
            <p className={habitValue}>{shakeConsistency.toFixed(0)}%</p>
            <p className={habitDescription}>{shakeDays} shakes recorded</p>
          </div>
          <div className={habitCard}>
            <p className={habitLabel}>Mindset notes</p>
            <p className={habitValue}>{journalingRate.toFixed(0)}%</p>
            <p className={habitDescription}>{notesLogged} reflections</p>
          </div>
          <div className={habitCard}>
            <p className={habitLabel}>Deload discipline</p>
            <p className={habitValue}>{restDiscipline.toFixed(0)}%</p>
            <p className={habitDescription}>{restEntries.length} strategic rest days</p>
          </div>
        </div>
      </section>

      <section className={sectionBlock}>
        <div className={sectionHeader}>
          <h2>Recent Highlights</h2>
          <span>{HIGHLIGHTS_LIMIT} most recent check-ins</span>
        </div>
        {highlightEntries.length === 0 ? (
          <p className={statDescription}>No activity yet. Your next entry will appear here.</p>
        ) : (
          <div className={highlightsList}>
            {highlightEntries.map(entry => {
              const detail =
                entry.exercises
                  .slice(0, 2)
                  .map(exercise => {
                    const name =
                      exercises.find(ex => ex.id === exercise.id)?.title ?? exercise.id;
                    const miniParts: string[] = [];
                    if (exercise.weight) miniParts.push(exercise.weight);
                    if (exercise.sets && exercise.reps) {
                      miniParts.push(`${exercise.sets}x${exercise.reps}`);
                    }
                    if (typeof exercise.painLevel === 'number') {
                      miniParts.push(`Pain ${exercise.painLevel}/10`);
                    }
                    return `${name}${miniParts.length > 0 ? ` · ${miniParts.join(' | ')}` : ''}`;
                  })
                  .join(' // ') || entry.notes || 'Mobility & recovery';

              return (
                <div key={entry.id} className={highlightRow}>
                  <div>
                    <p className={highlightDate}>{formatDisplayDate(entry.dateObj)}</p>
                    <p className={highlightSummary}>{formatWorkoutLabel(entry)}</p>
                  </div>
                  <p className={highlightDetail}>{detail}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
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
  gridTemplateColumns: { base: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
  gap: '0.75rem',
});

const badgeCard = css({
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  padding: '0.85rem 1rem',
  background: 'rgba(15, 23, 42, 0.35)',
  backdropFilter: 'blur(12px)',
});

const badgeLabel = css({
  fontSize: '0.75rem',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

const badgeValue = css({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#f8fafc',
});

const sectionBlock = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
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
  display: 'grid',
  gridTemplateColumns: { base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
  gap: '0.8rem',
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

const highlightsList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
});

const highlightRow = css({
  borderRadius: '16px',
  border: '1px solid rgba(59, 130, 246, 0.25)',
  padding: '1rem 1.25rem',
  background: 'rgba(8, 8, 8, 0.65)',
  display: 'flex',
  flexDirection: { base: 'column', md: 'row' },
  gap: '0.75rem',
  justifyContent: 'space-between',
});

const highlightDate = css({
  fontSize: '0.8rem',
  color: '#94a3b8',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

const highlightSummary = css({
  fontSize: '1rem',
  fontWeight: 600,
  color: '#f8fafc',
});

const highlightDetail = css({
  fontSize: '0.95rem',
  color: '#cbd5f5',
});

