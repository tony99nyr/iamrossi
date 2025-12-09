import type { Metadata } from 'next';
import Link from 'next/link';
import { css, cx } from '@styled-system/css';
import { getEntries, getExercises } from '@/lib/kv';
import { getRehabSettingsWithDefaults } from '@/lib/rehab-settings';
import type { Exercise, ExerciseEntry, RehabEntry } from '@/types';

const DAYS_TO_REPORT = 30;

export const metadata: Metadata = {
  title: 'Knee Rehab · 30-Day Print Report',
  description: 'Printable rehab log for sharing with a physical therapist. Includes vitamin protocol, protein shake ingredients, and a day-by-day breakdown of the last 30 days.',
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

const formatLongDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatShortDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const formatRangeLabel = (start: Date, end: Date): string => {
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
};

const summarizeExercise = (entry: ExerciseEntry): string => {
  const parts: string[] = [];
  if (entry.sets && entry.reps) {
    parts.push(`${entry.sets}×${entry.reps}`);
  }
  if (entry.weight) {
    parts.push(entry.weight);
  }
  if (entry.timeElapsed) {
    parts.push(entry.timeElapsed);
  }
  if (entry.bfr) {
    parts.push('BFR');
  }
  return parts.join(' · ');
};

const summarizeRatings = (entry: ExerciseEntry): string => {
  const parts: string[] = [];
  if (typeof entry.painLevel === 'number') {
    parts.push(`Pain ${entry.painLevel}/10`);
  }
  if (typeof entry.difficultyLevel === 'number') {
    parts.push(`Diff ${entry.difficultyLevel}/10`);
  }
  return parts.join(' · ');
};

const determineStatus = (entry?: RehabEntry): { label: string; tone: 'active' | 'rest' | 'unlogged' } => {
  if (!entry) {
    return { label: 'No entry logged', tone: 'unlogged' };
  }
  if (entry.isRestDay) {
    return { label: 'Rest & recovery', tone: 'rest' };
  }
  if (entry.exercises.length === 0) {
    return { label: 'Planning / notes only', tone: 'active' };
  }
  return { label: `${entry.exercises.length} exercise${entry.exercises.length === 1 ? '' : 's'} logged`, tone: 'active' };
};

export default async function KneeRehabPrintPage() {
  const [entries, exercises, settings] = await Promise.all([
    getEntries(),
    getExercises(),
    getRehabSettingsWithDefaults(),
  ]);

  const exerciseMap = new Map<string, Exercise>(exercises.map(ex => [ex.id, ex]));
  const entryMap = new Map<string, RehabEntry>(entries.map(entry => [entry.date, entry]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (DAYS_TO_REPORT - 1));

  const windowDays = Array.from({ length: DAYS_TO_REPORT }, (_, offset) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + offset);
    const key = toYMD(date);
    return {
      date,
      key,
      entry: entryMap.get(key),
    };
  });

  const shakeTotals = settings.proteinShake.ingredients.reduce(
    (acc, ingredient) => ({
      calories: acc.calories + (ingredient.calories || 0),
      protein: acc.protein + (ingredient.protein || 0),
      carbs: acc.carbs + (ingredient.carbs || 0),
      fat: acc.fat + (ingredient.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const lastUpdatedLabel = formatLongDate(new Date());

  return (
    <div className={pageWrapper}>
      <header className={headerBlock}>
        <div>
          <p className={eyebrow}>Knee Rehab · Printable Brief</p>
          <h1 className={pageTitle}>30-Day Activity Report</h1>
          <p className={rangeLabel}>Coverage: {formatRangeLabel(startDate, today)}</p>
          <p className={updatedLabel}>Generated on {lastUpdatedLabel}. Use your browser’s print dialog to export a PDF for your PT.</p>
        </div>
        <div className={headerLinks}>
          <Link href="/tools/knee-rehab" className={backLink}>
            ← Back to tracker
          </Link>
          <p className={printHint}>Tip: Cmd/Ctrl + P to print</p>
        </div>
      </header>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <div>
            <p className={sectionEyebrow}>Daily Baseline</p>
            <h2 className={sectionTitle}>Vitamin & Protein Routine</h2>
          </div>
        </div>
        <div className={nutritionGrid}>
          <div className={nutritionColumn}>
            <h3 className={columnTitle}>Vitamin protocol</h3>
            <ul className={vitaminList}>
              {settings.vitamins.map(vitamin => (
                <li key={vitamin.name} className={vitaminItem}>
                  <div className={vitaminRow}>
                    <span className={vitaminName}>{vitamin.name}</span>
                    <span className={vitaminDose}>{vitamin.dosage}</span>
                  </div>
                  <p className={vitaminMeta}>
                    {vitamin.frequency}
                    {vitamin.notes ? ` · ${vitamin.notes}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className={nutritionColumn}>
            <h3 className={columnTitle}>Protein shake blueprint</h3>
            <p className={shakeSummary}>
              Serving size: {settings.proteinShake.servingSize}. Totals per serving: {Math.round(shakeTotals.calories)} cal ·{' '}
              {Math.round(shakeTotals.protein)}g protein · {Math.round(shakeTotals.carbs)}g carbs · {Math.round(shakeTotals.fat)}g fat
            </p>
            <table className={shakeTable}>
              <thead>
                <tr>
                  <th align="left">Ingredient</th>
                  <th align="left">Amount</th>
                  <th align="left">Details</th>
                </tr>
              </thead>
              <tbody>
                {settings.proteinShake.ingredients.map(ingredient => (
                  <tr key={ingredient.name}>
                    <td>{ingredient.name}</td>
                    <td>{ingredient.amount}</td>
                    <td className={ingredientMeta}>
                      {[
                        ingredient.protein ? `${ingredient.protein}g protein` : null,
                        ingredient.calories ? `${ingredient.calories} cal` : null,
                        ingredient.notes,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <div>
            <p className={sectionEyebrow}>Rolling window</p>
            <h2 className={sectionTitle}>Day-by-day rehab activity</h2>
          </div>
          <p className={sectionContext}>Includes rest days, supplements, notes, and every logged exercise.</p>
        </div>
        <div className={dayGrid}>
          {windowDays.map(({ date, key, entry }) => {
            const status = determineStatus(entry);
            return (
              <article key={key} className={dayCard}>
                <header className={dayHeader}>
                  <div>
                    <p className={dayLabel}>{formatShortDate(date)}</p>
                    <p className={dayFullDate}>{formatLongDate(date)}</p>
                  </div>
                  <span
                    className={cx(
                      statusChip,
                      status.tone === 'active' && statusChipActive,
                      status.tone === 'rest' && statusChipRest,
                      status.tone === 'unlogged' && statusChipMuted
                    )}
                  >
                    {status.label}
                  </span>
                </header>

                <dl className={habitGrid}>
                  <div>
                    <dt>Vitamins</dt>
                    <dd>{entry ? (entry.vitaminsTaken ? '✔︎' : '—') : '—'}</dd>
                  </div>
                  <div>
                    <dt>Protein shake</dt>
                    <dd>{entry ? (entry.proteinShake ? '✔︎' : '—') : '—'}</dd>
                  </div>
                  <div>
                    <dt>Rest day</dt>
                    <dd>{entry ? (entry.isRestDay ? 'Yes' : 'No') : '—'}</dd>
                  </div>
                  <div>
                    <dt>Exercises</dt>
                    <dd>{entry ? entry.exercises.length : 0}</dd>
                  </div>
                </dl>

                {entry?.notes && (
                  <p className={notesBlock}>
                    <strong>Notes:</strong> {entry.notes}
                  </p>
                )}

                {!entry && <p className={emptyState}>No data captured for this date.</p>}
                {entry && entry.isRestDay && !entry.notes && <p className={restReminder}>Intentional rest & tissue recovery.</p>}

                {entry && entry.exercises.length > 0 && (
                  <ul className={exerciseList}>
                    {entry.exercises.map((exerciseEntry, index) => {
                      const exercise = exerciseMap.get(exerciseEntry.id);
                      const prescription = summarizeExercise(exerciseEntry);
                      const ratings = summarizeRatings(exerciseEntry);
                      return (
                        <li key={`${exerciseEntry.id}-${index}`} className={exerciseItem}>
                          <div className={exerciseHeader}>
                            <span className={exerciseName}>{exercise?.title ?? exerciseEntry.id}</span>
                            {prescription && <span className={exerciseMeta}>{prescription}</span>}
                          </div>
                          {(ratings || exerciseEntry.weight || exerciseEntry.timeElapsed || exerciseEntry.bfr) && (
                            <p className={exerciseDetails}>
                              {[ratings, exerciseEntry.weight && !prescription.includes(exerciseEntry.weight) ? exerciseEntry.weight : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const pageWrapper = css({
  backgroundColor: 'white',
  color: '#0f172a',
  minHeight: '100vh',
  padding: { base: '2rem 1.25rem 3rem', md: '3rem 2.5rem 4rem' },
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '@media print': {
    padding: '0.5in',
    boxShadow: 'none',
  },
});

const headerBlock = css({
  display: 'flex',
  flexDirection: { base: 'column', lg: 'row' },
  justifyContent: 'space-between',
  gap: '1.5rem',
  borderBottom: '1px solid #e2e8f0',
  paddingBottom: '1.5rem',
});

const eyebrow = css({
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  fontSize: '0.75rem',
  color: '#475569',
});

const pageTitle = css({
  fontSize: { base: '2rem', md: '2.5rem' },
  fontWeight: 700,
  margin: '0.5rem 0',
  color: '#0f172a',
});

const rangeLabel = css({
  fontSize: '1rem',
  color: '#334155',
});

const updatedLabel = css({
  fontSize: '0.9rem',
  color: '#475569',
  marginTop: '0.5rem',
});

const headerLinks = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  alignItems: { base: 'flex-start', lg: 'flex-end' },
});

const backLink = css({
  color: '#2563eb',
  fontWeight: 600,
  textDecoration: 'none',
  '@media print': {
    display: 'none',
  },
});

const printHint = css({
  fontSize: '0.85rem',
  color: '#475569',
  '@media print': {
    display: 'none',
  },
});

const sectionCard = css({
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  padding: { base: '1.5rem', md: '2rem' },
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  '@media print': {
    boxShadow: 'none',
    breakInside: 'avoid',
  },
});

const sectionHeader = css({
  display: 'flex',
  flexDirection: { base: 'column', md: 'row' },
  justifyContent: 'space-between',
  gap: '0.5rem',
});

const sectionEyebrow = css({
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  color: '#94a3b8',
  letterSpacing: '0.18em',
});

const sectionTitle = css({
  fontSize: '1.5rem',
  fontWeight: 600,
  color: '#0f172a',
});

const sectionContext = css({
  fontSize: '0.9rem',
  color: '#475569',
});

const nutritionGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', lg: '1fr 1fr' },
  gap: '1.5rem',
});

const nutritionColumn = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
});

const columnTitle = css({
  fontSize: '1.1rem',
  fontWeight: 600,
  color: '#0f172a',
});

const vitaminList = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
});

const vitaminItem = css({
  borderBottom: '1px solid #e2e8f0',
  paddingBottom: '0.75rem',
  '&:last-of-type': {
    borderBottom: 'none',
  },
});

const vitaminRow = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
});

const vitaminName = css({
  fontWeight: 600,
  color: '#0f172a',
});

const vitaminDose = css({
  color: '#475569',
  fontWeight: 500,
});

const vitaminMeta = css({
  marginTop: '0.3rem',
  fontSize: '0.9rem',
  color: '#475569',
});

const shakeSummary = css({
  fontSize: '0.95rem',
  color: '#475569',
});

const shakeTable = css({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.95rem',
  '& th, & td': {
    borderBottom: '1px solid #e2e8f0',
    padding: '0.5rem 0',
  },
  '& th': {
    fontSize: '0.85rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#94a3b8',
  },
});

const ingredientMeta = css({
  color: '#475569',
});

const dayGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'repeat(auto-fit, minmax(280px, 1fr))' },
  gap: '1rem',
});

const dayCard = css({
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
  minHeight: '280px',
  background: '#fcfcfd',
  '@media print': {
    breakInside: 'avoid',
  },
});

const dayHeader = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
  alignItems: 'flex-start',
});

const dayLabel = css({
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#0f172a',
});

const dayFullDate = css({
  fontSize: '0.85rem',
  color: '#475569',
});

const statusChip = css({
  borderRadius: '999px',
  padding: '0.3rem 0.85rem',
  fontSize: '0.8rem',
  fontWeight: 600,
});

const statusChipActive = css({
  background: '#ecfccb',
  color: '#3f6212',
});

const statusChipRest = css({
  background: '#fef9c3',
  color: '#854d0e',
});

const statusChipMuted = css({
  background: '#e2e8f0',
  color: '#475569',
});

const habitGrid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '0.5rem',
  '& dt': {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#94a3b8',
  },
  '& dd': {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#0f172a',
  },
});

const notesBlock = css({
  fontSize: '0.95rem',
  color: '#0f172a',
  background: '#f8fafc',
  borderRadius: '12px',
  padding: '0.75rem',
  border: '1px solid #e2e8f0',
});

const emptyState = css({
  fontSize: '0.9rem',
  color: '#94a3b8',
  fontStyle: 'italic',
});

const restReminder = css({
  fontSize: '0.9rem',
  color: '#475569',
});

const exerciseList = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.8rem',
});

const exerciseItem = css({
  borderTop: '1px solid #e2e8f0',
  paddingTop: '0.75rem',
  '&:first-of-type': {
    borderTop: 'none',
    paddingTop: 0,
  },
});

const exerciseHeader = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
});

const exerciseName = css({
  fontWeight: 600,
  color: '#0f172a',
});

const exerciseMeta = css({
  fontSize: '0.85rem',
  color: '#475569',
});

const exerciseDetails = css({
  fontSize: '0.85rem',
  color: '#475569',
  marginTop: '0.3rem',
});
