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
    parts.push(`${entry.weight} lbs`);
  }
  if (entry.timeElapsed) {
    parts.push(`${entry.timeElapsed} minutes`);
  }
  if (entry.bfr) {
    parts.push('BFR');
  }
  return parts.join(' ');
};

const summarizeRatings = (entry: ExerciseEntry): string => {
  const parts: string[] = [];
  if (typeof entry.painLevel === 'number') {
    parts.push(`Pain ${entry.painLevel}/10`);
  }
  return parts.join(' ');
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
  return { label: `${entry.exercises.length} exercise${entry.exercises.length === 1 ? '' : 's'}`, tone: 'active' };
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
    <div className={cx('print-page-container', printPageContainer)}>
      <header className={cx('print-page-header', printPageHeader)}>
        <div>
          <p className={cx('print-page-eyebrow', printPageEyebrow)}>Knee Rehab · Printable Brief</p>
          <h1 className={cx('print-page-title', printPageTitle)}>30-Day Activity Report</h1>
          <p className={cx('date-range-label', css({ fontSize: '1rem', color: '#334155' }))}>Coverage: {formatRangeLabel(startDate, today)}</p>
          <p className={cx('generation-timestamp-label', css({ fontSize: '0.9rem', color: '#475569', marginTop: '0.5rem', '@media print': { marginTop: '0.25rem', fontSize: '0.75rem' } }))}>Generated on {lastUpdatedLabel}. Use your browser's print dialog to export a PDF for your PT.</p>
        </div>
        <div className={cx('print-page-header-actions', printPageHeaderActions)}>
          <Link href="/tools/knee-rehab" className={cx('back-to-tracker-link', css({ color: '#2563eb', fontWeight: 600, textDecoration: 'none', '@media print': { display: 'none' } }))}>
            ← Back to tracker
          </Link>
          <p className={cx('print-instructions-hint', css({ fontSize: '0.85rem', color: '#475569', '@media print': { display: 'none' } }))}>Tip: Cmd/Ctrl + P to print</p>
        </div>
      </header>

      <section className={cx('print-section-card', printSectionCard)}>
        <div className={cx('print-section-header', printSectionHeader)}>
          <div>
            <p className={cx('print-section-eyebrow', printSectionEyebrow)}>Daily Baseline</p>
            <h2 className={cx('print-section-title', printSectionTitle)}>Vitamin & Protein Routine</h2>
          </div>
        </div>
        <div className={cx('vitamin-and-protein-grid', vitaminAndProteinGrid)}>
          <div className={cx('vitamin-or-protein-column', vitaminOrProteinColumn)}>
            <h3 className={cx('vitamin-or-protein-column-title', vitaminOrProteinColumnTitle)}>Vitamin protocol</h3>
            <ul className={cx('vitamin-protocol-list', vitaminProtocolList)}>
              {settings.vitamins.map(vitamin => (
                <li key={vitamin.name} className={cx('vitamin-protocol-item', vitaminProtocolItem)}>
                  <div className={cx('vitamin-name-and-dose-row', vitaminNameAndDoseRow)}>
                    <span className={cx('vitamin-protocol-name', css({ fontWeight: 600, color: '#0f172a' }))}>{vitamin.name}</span>
                    <span className={cx('vitamin-protocol-dosage', css({ color: '#475569', fontWeight: 500 }))}>{vitamin.dosage}</span>
                  </div>
                  <p className={cx('vitamin-protocol-metadata', css({ marginTop: '0.3rem', fontSize: '0.9rem', color: '#475569', '@media print': { marginTop: '0.125rem', fontSize: '0.8rem' } }))}>
                    {vitamin.frequency}
                    {vitamin.notes ? ` · ${vitamin.notes}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className={cx('vitamin-or-protein-column', vitaminOrProteinColumn)}>
            <h3 className={cx('vitamin-or-protein-column-title', vitaminOrProteinColumnTitle)}>Protein shake blueprint</h3>
            <p className={cx('protein-shake-summary', css({ fontSize: '0.95rem', color: '#475569' }))}>
              Serving size: {settings.proteinShake.servingSize}. Totals per serving: {Math.round(shakeTotals.calories)} cal ·{' '}
              {Math.round(shakeTotals.protein)}g protein · {Math.round(shakeTotals.carbs)}g carbs · {Math.round(shakeTotals.fat)}g fat
            </p>
            <table className={cx('protein-shake-ingredients-table', proteinShakeIngredientsTable)}>
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
                    <td className={cx('protein-shake-ingredient-metadata', css({ color: '#475569' }))}>
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

      <section className={cx('print-section-card', printSectionCard)}>
        <div className={cx('print-section-header', printSectionHeader)}>
          <div>
            <p className={cx('print-section-eyebrow', printSectionEyebrow)}>Rolling window</p>
            <h2 className={cx('print-section-title', printSectionTitle)}>Day-by-day rehab activity</h2>
          </div>
          <p className={cx('print-section-description', css({ fontSize: '0.9rem', color: '#475569' }))}>Includes rest days, supplements, notes, and every logged exercise.</p>
        </div>
        <div className={cx('daily-activity-grid', dailyActivityGrid)}>
          {windowDays
            .filter(({ entry }) => entry)
            .map(({ date, key, entry }) => {
              const status = determineStatus(entry);
              return (
                <article key={key} className={cx('daily-activity-card', dailyActivityCard)}>
                <header className={cx('daily-activity-card-header', dailyActivityCardHeader)}>
                  <div>
                    <p className={cx('daily-activity-date-label', css({ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', '@media print': { fontSize: '0.85rem', lineHeight: '1.2' } }))}>{formatShortDate(date)}</p>
                    <p className={cx('daily-activity-full-date', css({ fontSize: '0.85rem', color: '#475569', '@media print': { fontSize: '0.75rem', marginTop: '0.125rem' } }))}>{formatLongDate(date)}</p>
                  </div>
                  <span
                    className={cx(
                      'daily-activity-status-chip',
                      dailyActivityStatusChip,
                      status.tone === 'active' && 'daily-activity-status-chip-active',
                      status.tone === 'active' && dailyActivityStatusChipActive,
                      status.tone === 'rest' && 'daily-activity-status-chip-rest',
                      status.tone === 'rest' && dailyActivityStatusChipRest,
                      status.tone === 'unlogged' && 'daily-activity-status-chip-unlogged',
                      status.tone === 'unlogged' && dailyActivityStatusChipUnlogged
                    )}
                  >
                    {status.label}
                  </span>
                </header>

                {entry?.notes && (
                  <p className={cx('daily-activity-notes-block', dailyActivityNotesBlock)}>
                    <strong>Notes:</strong> {entry.notes}
                  </p>
                )}

                {entry && entry.isRestDay && !entry.notes && <p className={cx('daily-activity-rest-reminder', dailyActivityRestReminder)}>Intentional rest & tissue recovery.</p>}

                {entry && entry.exercises.length > 0 && (
                  <ul className={cx('daily-activity-exercise-list', dailyActivityExerciseList)}>
                    {entry.exercises
                      .map((exerciseEntry) => {
                        const exercise = exerciseMap.get(exerciseEntry.id);
                        return { exerciseEntry, exercise };
                      })
                      .filter(({ exercise }) => exercise?.title)
                      .map(({ exerciseEntry, exercise }, index) => {
                        const prescription = summarizeExercise(exerciseEntry);
                        const ratings = summarizeRatings(exerciseEntry);
                        return (
                          <li key={`${exerciseEntry.id}-${index}`} className={cx('daily-activity-exercise-item', dailyActivityExerciseItem)}>
                            <div className={cx('daily-activity-exercise-header', dailyActivityExerciseHeader)}>
                              <span className={cx('daily-activity-exercise-name', css({ fontWeight: 600, color: '#0f172a', '@media print': { fontSize: '0.9rem', lineHeight: '1.3' } }))}>{exercise?.title}</span>
                              {prescription && <span className={cx('daily-activity-exercise-prescription', css({ fontSize: '0.85rem', color: '#475569', '@media print': { fontSize: '0.75rem' } }))}>{prescription}</span>}
                            </div>
                            {(ratings || exerciseEntry.weight || exerciseEntry.timeElapsed || exerciseEntry.bfr) && (
                              <p className={cx('daily-activity-exercise-details', css({ fontSize: '0.85rem', color: '#475569', marginTop: '0', '@media print': { fontSize: '0.75rem', lineHeight: '1.3' } }))}>
                                {[ratings, exerciseEntry.weight && !prescription.includes(exerciseEntry.weight) ? `${exerciseEntry.weight} lbs` : null]
                                  .filter(Boolean)
                                  .join(' ')}
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

const printPageContainer = css({
  backgroundColor: 'white',
  color: '#0f172a',
  minHeight: '100vh',
  padding: { base: '2rem 1.25rem 3rem', md: '3rem 2.5rem 4rem' },
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '@media print': {
    padding: '0.25in',
    boxShadow: 'none',
    gap: '0.5rem',
  },
});

const printPageHeader = css({
  display: 'flex',
  flexDirection: { base: 'column', lg: 'row' },
  justifyContent: 'space-between',
  gap: '1.5rem',
  paddingBottom: '1.5rem',
  '@media print': {
    paddingBottom: '0.25rem',
    gap: '0.25rem',
  },
});

const printPageEyebrow = css({
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  fontSize: '0.75rem',
  color: '#475569',
});

const printPageTitle = css({
  fontSize: { base: '2rem', md: '2.5rem' },
  fontWeight: 700,
  margin: '0.5rem 0',
  color: '#0f172a',
  '@media print': {
    fontSize: '1.25rem',
    margin: '0.125rem 0',
    lineHeight: '1.2',
  },
});

const printPageHeaderActions = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  alignItems: { base: 'flex-start', lg: 'flex-end' },
});

const printSectionCard = css({
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
    padding: '0.5rem',
    gap: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
  },
});

const printSectionHeader = css({
  display: 'flex',
  flexDirection: { base: 'column', md: 'row' },
  justifyContent: 'space-between',
  gap: '0.5rem',
  '@media print': {
    gap: '0.25rem',
  },
});

const printSectionEyebrow = css({
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  color: '#94a3b8',
  letterSpacing: '0.18em',
  '@media print': {
    fontSize: '0.65rem',
    marginBottom: '0.125rem',
  },
});

const printSectionTitle = css({
  fontSize: '1.5rem',
  fontWeight: 600,
  color: '#0f172a',
  '@media print': {
    fontSize: '1.1rem',
    lineHeight: '1.2',
  },
});

const vitaminAndProteinGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', lg: '1fr 1fr' },
  gap: '5rem',
  '@media print': {
    gap: '2rem',
  },
});

const vitaminOrProteinColumn = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  '@media print': {
    gap: '0.5rem',
  },
});

const vitaminOrProteinColumnTitle = css({
  fontSize: '1.1rem',
  fontWeight: 600,
  color: '#0f172a',
});

const vitaminProtocolList = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
  '@media print': {
    gap: '0.5rem',
  },
});

const vitaminProtocolItem = css({
  borderBottom: '1px solid #e2e8f0',
  paddingBottom: '0.75rem',
  '&:last-of-type': {
    borderBottom: 'none',
  },
  '@media print': {
    paddingBottom: '0.5rem',
  },
});

const vitaminNameAndDoseRow = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
});

const proteinShakeIngredientsTable = css({
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

const dailyActivityGrid = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'repeat(auto-fit, minmax(280px, 1fr))' },
  gap: '1rem',
  '@media print': {
    gap: '0.5rem',
  },
});

const dailyActivityCard = css({
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
    minHeight: 'auto',
    padding: '0.5rem',
    gap: '0.5rem',
    borderRadius: '4px',
    marginBottom: '0.5rem',
  },
});

const dailyActivityCardHeader = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
  alignItems: 'flex-start',
  '@media print': {
    gap: '0.25rem',
    marginBottom: '0.25rem',
  },
});

const dailyActivityStatusChip = css({
  borderRadius: '999px',
  padding: '0.3rem 0.85rem',
  fontSize: '0.8rem',
  fontWeight: 600,
  '@media print': {
    padding: '0.15rem 0.5rem',
    fontSize: '0.7rem',
  },
});

const dailyActivityStatusChipActive = css({
  background: '#ecfccb',
  color: '#3f6212',
});

const dailyActivityStatusChipRest = css({
  background: '#fef9c3',
  color: '#854d0e',
});

const dailyActivityStatusChipUnlogged = css({
  background: '#e2e8f0',
  color: '#475569',
});

const dailyActivityNotesBlock = css({
  fontSize: '0.95rem',
  color: '#0f172a',
  background: '#f8fafc',
  borderRadius: '12px',
  padding: '0.75rem',
  border: '1px solid #e2e8f0',
  '@media print': {
    padding: '0.5rem',
    borderRadius: '4px',
    fontSize: '0.85rem',
    marginTop: '0.25rem',
    marginBottom: '0.25rem',
  },
});

const dailyActivityRestReminder = css({
  fontSize: '0.9rem',
  color: '#475569',
  '@media print': {
    fontSize: '0.8rem',
    marginTop: '0.25rem',
  },
});

const dailyActivityExerciseList = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  '@media print': {
    gap: '0.15rem',
  },
});

const dailyActivityExerciseItem = css({
  borderTop: '1px solid #e2e8f0',
  paddingTop: '0.15rem',
  '&:first-of-type': {
    borderTop: 'none',
    paddingTop: 0,
  },
  '@media print': {
    paddingTop: '0.1rem',
    borderTop: 'none',
  },
});

const dailyActivityExerciseHeader = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
  '@media print': {
    gap: '0.25rem',
  },
});

