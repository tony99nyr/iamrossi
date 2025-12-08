import { getExercises, getEntries } from '@/lib/kv';
import type { RehabSettings } from '@/types';
import type { Metadata } from 'next';
import { createClient } from 'redis';
import { ROSSI_SHAKE, ROSSI_VITAMINS } from '@/data/rehab-defaults';

export const metadata: Metadata = {
  title: 'Knee Rehab Summary | Rehabilitation Progress Report',
  description: 'Comprehensive summary of knee rehabilitation progress, exercise plan, and activity history',
  robots: {
    index: false,
    follow: false,
  },
};

// Force dynamic rendering to always show fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const redis = createClient({
  url: process.env.REDIS_URL
});

async function getSettings(): Promise<RehabSettings> {
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    const data = await redis.get('rehab:settings');
    if (!data) {
      return {
        vitamins: ROSSI_VITAMINS,
        proteinShake: ROSSI_SHAKE,
      };
    }
    const parsed = JSON.parse(data);
    
    // Merge defaults if data is missing
    if (!parsed.vitamins || parsed.vitamins.length === 0) {
      parsed.vitamins = ROSSI_VITAMINS;
    }
    if (!parsed.proteinShake || !parsed.proteinShake.ingredients || parsed.proteinShake.ingredients.length === 0) {
      parsed.proteinShake = ROSSI_SHAKE;
    }
    
    return parsed;
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {
      vitamins: ROSSI_VITAMINS,
      proteinShake: ROSSI_SHAKE,
    };
  }
}

export default async function RehabSummaryPage() {
  const exercises = await getExercises();
  const entries = await getEntries();
  const settings = await getSettings();

  // Sort entries by date descending (newest first)
  const sortedEntries = entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Get today's date in local timezone
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Get date range for summary (last 90 days)
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoffDate = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`;
  
  const recentEntries = sortedEntries.filter(e => e.date >= cutoffDate);
  const activeDays = recentEntries.filter(e => !e.isRestDay && e.exercises.length > 0).length;
  const restDays = recentEntries.filter(e => e.isRestDay).length;
  const totalDays = recentEntries.length;
  
  // Calculate workout days (all days that aren't rest days)
  const workoutDays = totalDays - restDays;
  
  // Calculate total exercise sessions (all exercise instances across all days)
  const totalExerciseSessions = recentEntries.reduce((sum, entry) => sum + entry.exercises.length, 0);
  
  // Calculate average exercises per workout day
  const avgExercisesPerWorkout = activeDays > 0 ? (totalExerciseSessions / activeDays).toFixed(1) : '0';
  
  // Calculate workouts per week based on actual date range of entries
  // Find the actual date span of logged entries
  let actualWeeksInPeriod = 90 / 7; // Default to full period
  if (recentEntries.length > 0) {
    const entryDates = recentEntries.map(e => new Date(e.date).getTime());
    const earliestDate = Math.min(...entryDates);
    const latestDate = Math.max(...entryDates);
    const daysSpan = Math.max(1, Math.ceil((latestDate - earliestDate) / (1000 * 60 * 60 * 24)) + 1);
    actualWeeksInPeriod = daysSpan / 7;
  }
  const workoutsPerWeek = workoutDays > 0 && actualWeeksInPeriod > 0 ? (workoutDays / actualWeeksInPeriod).toFixed(1) : '0';

  // Calculate exercise statistics
  const exerciseStats = exercises.map(ex => {
    const logs = recentEntries.flatMap(e => e.exercises.filter(x => x.id === ex.id));
    const painLevels = logs.filter(l => l.painLevel !== undefined && l.painLevel !== null).map(l => l.painLevel!);
    const difficultyLevels = logs.filter(l => l.difficultyLevel !== undefined && l.difficultyLevel !== null).map(l => l.difficultyLevel!);
    
    const avgPain = painLevels.length > 0 
      ? (painLevels.reduce((sum, p) => sum + p, 0) / painLevels.length).toFixed(1)
      : null;
    const avgDifficulty = difficultyLevels.length > 0
      ? (difficultyLevels.reduce((sum, d) => sum + d, 0) / difficultyLevels.length).toFixed(1)
      : null;
    
    // Get most recent weight/progression
    const recentLogs = logs.filter(l => l.weight || l.reps || l.sets).slice(0, 5);
    const latestProgression = recentLogs.length > 0 ? recentLogs[0] : null;
    
    return {
      exercise: ex,
      sessionCount: logs.length,
      avgPain,
      avgDifficulty,
      latestProgression,
    };
  }).filter(stat => stat.sessionCount > 0); // Only show exercises that have been performed

  // Calculate overall pain trends
  const allPainLevels = recentEntries.flatMap(e => 
    e.exercises
      .filter(ex => ex.painLevel !== undefined && ex.painLevel !== null)
      .map(ex => ({ date: e.date, pain: ex.painLevel! }))
  );
  const avgPainOverall = allPainLevels.length > 0
    ? (allPainLevels.reduce((sum, p) => sum + p.pain, 0) / allPainLevels.length).toFixed(1)
    : null;

  // Calculate shake totals
  const shakeTotals = settings.proteinShake.ingredients.reduce((acc, curr) => ({
    calories: acc.calories + (curr.calories || 0),
    protein: acc.protein + (curr.protein || 0),
    carbs: acc.carbs + (curr.carbs || 0),
    fat: acc.fat + (curr.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Format date for display
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '2rem 1rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: '1.6',
      color: '#333',
      backgroundColor: '#fff',
    }}>
      <style>{`
        @media print {
          body { print-color-adjust: exact; }
          .no-print { display: none; }
          @page { margin: 1in; }
        }
        @media screen {
          body { background: #f5f5f5; }
        }
      `}</style>

      {/* Header */}
      <header style={{ marginBottom: '2rem', borderBottom: '2px solid #333', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '700' }}>Knee Rehabilitation Summary</h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '1rem' }}>
          Generated: {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })}
        </p>
      </header>

      {/* Overview Section */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
          Overview (Last 90 Days)
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Total Exercise Sessions</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#2563eb' }}>{totalExerciseSessions}</div>
            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>Across {activeDays} workout days</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Avg Exercises/Workout</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#dc2626' }}>{avgExercisesPerWorkout}</div>
            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>Workout intensity</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Workouts per Week</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#059669' }}>{workoutsPerWeek}</div>
            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>Average frequency</div>
          </div>
          {avgPainOverall !== null && (
            <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Avg Pain Level</div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: parseFloat(avgPainOverall) > 5 ? '#dc2626' : '#059669' }}>
                {avgPainOverall}/10
              </div>
              <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>During exercises</div>
            </div>
          )}
        </div>
        <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
          Tracking period: {formatDate(cutoffDate)} to {formatDate(today)}
        </p>
      </section>

      {/* Current Exercise Plan */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
          Current Exercise Plan
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {exercises.map(ex => (
            <div key={ex.id} style={{ 
              padding: '1rem', 
              backgroundColor: '#f9f9f9', 
              borderRadius: '8px',
              borderLeft: '4px solid #2563eb'
            }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: '600' }}>
                {ex.title}
              </h3>
              <p style={{ margin: '0', fontSize: '0.875rem', color: '#666' }}>
                {ex.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Exercise Performance Summary */}
      {exerciseStats.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
            Exercise Performance Summary
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '0.875rem'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Exercise</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Sessions</th>
                  {exerciseStats.some(s => s.avgPain !== null) && (
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Avg Pain</th>
                  )}
                  {exerciseStats.some(s => s.avgDifficulty !== null) && (
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Avg Difficulty</th>
                  )}
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Latest Progression</th>
                </tr>
              </thead>
              <tbody>
                {exerciseStats.map(stat => (
                  <tr key={stat.exercise.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem', fontWeight: '500' }}>{stat.exercise.title}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{stat.sessionCount}</td>
                    {exerciseStats.some(s => s.avgPain !== null) && (
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: stat.avgPain !== null && parseFloat(stat.avgPain) > 5 ? '#dc2626' : '#059669' }}>
                        {stat.avgPain !== null ? `${stat.avgPain}/10` : '—'}
                      </td>
                    )}
                    {exerciseStats.some(s => s.avgDifficulty !== null) && (
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {stat.avgDifficulty !== null ? `${stat.avgDifficulty}/10` : '—'}
                      </td>
                    )}
                    <td style={{ padding: '0.75rem', fontSize: '0.8125rem', color: '#666' }}>
                      {stat.latestProgression ? (
                        <>
                          {stat.latestProgression.weight && <span>{stat.latestProgression.weight} </span>}
                          {stat.latestProgression.sets && stat.latestProgression.reps && (
                            <span>{stat.latestProgression.sets}x{stat.latestProgression.reps} </span>
                          )}
                          {stat.latestProgression.timeElapsed && <span>{stat.latestProgression.timeElapsed}</span>}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
          Recent Activity (Last 30 Days)
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {recentEntries.slice(0, 30).map(entry => {
            const date = formatDate(entry.date);
            const isToday = entry.date === today;
            
            return (
              <div key={entry.id} style={{ 
                padding: '1rem', 
                backgroundColor: isToday ? '#eff6ff' : '#f9f9f9', 
                borderRadius: '8px',
                borderLeft: isToday ? '4px solid #2563eb' : '4px solid transparent'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div>
                    <strong style={{ fontSize: '1rem' }}>{date}</strong>
                    {isToday && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#2563eb', fontWeight: '600' }}>TODAY</span>}
                    <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#666' }}>
                      {entry.isRestDay ? '😴 Rest Day' : '💪 Workout'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    {entry.vitaminsTaken && <span style={{ marginLeft: '0.5rem' }}>💊</span>}
                    {entry.proteinShake && <span style={{ marginLeft: '0.5rem' }}>🥤</span>}
                  </div>
                </div>
                
                {entry.notes && (
                  <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', fontStyle: 'italic', color: '#555' }}>
                    "{entry.notes}"
                  </p>
                )}
                
                {!entry.isRestDay && entry.exercises.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                    <strong>Exercises:</strong> {entry.exercises.map(ex => {
                      const exercise = exercises.find(e => e.id === ex.id);
                      const parts = [];
                      if (ex.weight) parts.push(ex.weight);
                      if (ex.sets && ex.reps) parts.push(`${ex.sets}x${ex.reps}`);
                      if (ex.timeElapsed) parts.push(ex.timeElapsed);
                      if (ex.painLevel !== undefined && ex.painLevel !== null) parts.push(`Pain: ${ex.painLevel}/10`);
                      return `${exercise?.title || ex.id}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
                    }).join(' • ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Nutrition & Wellness */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
          Nutrition & Wellness Plan
        </h2>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>Daily Vitamins</h3>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.875rem' }}>
            {settings.vitamins.map((v, idx) => (
              <li key={idx} style={{ marginBottom: '0.5rem' }}>
                <strong>{v.name}:</strong> {v.dosage} ({v.frequency})
                {v.notes && <span style={{ color: '#666' }}> — {v.notes}</span>}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>Protein Shake</h3>
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', fontSize: '0.875rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Nutritional Profile:</strong> {Math.round(shakeTotals.calories)} calories, {Math.round(shakeTotals.protein)}g protein, {Math.round(shakeTotals.carbs)}g carbs, {Math.round(shakeTotals.fat)}g fat
            </div>
            <div>
              <strong>Ingredients:</strong>
              <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
                {settings.proteinShake.ingredients.map((ing, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>
                    {ing.name}: {ing.amount}
                    {ing.protein && <span style={{ color: '#666' }}> ({ing.protein}g protein)</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ 
        marginTop: '3rem', 
        paddingTop: '1rem', 
        borderTop: '1px solid #ddd', 
        fontSize: '0.75rem', 
        color: '#666',
        textAlign: 'center'
      }}>
        <p style={{ margin: 0 }}>
          This summary was automatically generated from rehabilitation tracking data.
          For questions or clarifications, please refer to the detailed tracking logs.
        </p>
      </footer>
    </div>
  );
}

