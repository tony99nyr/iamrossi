import { getExercises, getEntries } from '@/lib/kv';
import type { RehabSettings } from '@/types';
import type { Metadata } from 'next';
import { createClient } from 'redis';
import MarkdownRenderer from './MarkdownRenderer';

export const metadata: Metadata = {
  title: 'Knee Rehab AI Context | Rehabilitation Data Export',
  description: 'Comprehensive knee rehabilitation tracking data including exercises, pain levels, difficulty ratings, and progress over time. Designed for AI agents to analyze recovery trends and provide personalized insights.',
  openGraph: {
    title: 'Knee Rehab AI Context',
    description: 'Complete rehabilitation data export with exercise history, pain tracking, and recovery metrics for AI analysis',
    type: 'article',
  },
  robots: {
    index: false, // Don't index this page publicly
    follow: false,
  },
};

// Force dynamic rendering to always show fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const redis = createClient({
  url: process.env.REDIS_URL
});

import { ROSSI_SHAKE, ROSSI_VITAMINS } from '@/data/rehab-defaults';

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

export default async function AIContextPage() {
  const exercises = await getExercises();
  const entries = await getEntries();
  const settings = await getSettings();

  // Sort entries by date descending (newest first)
  const sortedEntries = entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Get today's date in local timezone (YYYY-MM-DD format)
  // This matches how dates are stored in entries (local timezone, not UTC)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaysEntry = sortedEntries.find(e => e.date === today);
  const recentEntries = sortedEntries.filter(e => e.date !== today).slice(0, 30);

  // Calculate shake totals
  const shakeTotals = settings.proteinShake.ingredients.reduce((acc, curr) => ({
    calories: acc.calories + (curr.calories || 0),
    protein: acc.protein + (curr.protein || 0),
    carbs: acc.carbs + (curr.carbs || 0),
    fat: acc.fat + (curr.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Generate optimized markdown prompt
  const markdown = `# Knee Rehab Assistant Context

**Role:** Act as an expert Physical Therapist, Strength Coach, and Nutritionist.
**Objective:** Analyze my knee rehabilitation data to help me **increase the strength and size of my right quad and calf** for knee stabilization and pain reduction.
**Critical Focus:**
1.  **Hypertrophy & Strength:** Focus on progressive overload and volume for the right leg.
2.  **Range of Motion (ROM):** Pay close attention to any mention of degrees (e.g., "90 deg", "110°") in exercise titles or notes.
3.  **Wellness & Recovery:** Analyze my nutrition and consistency to ensure I'm fueling muscle growth and recovery.

---

## 1. Current Status & Today's Workout
**Date:** ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

${todaysEntry ? `### ✅ TODAY'S LOGGED ACTIVITY
${todaysEntry.isRestDay ? '**Status:** REST DAY 😴' : '**Status:** ACTIVE RECOVERY 💪'}
${todaysEntry.notes ? `**📝 Daily Notes:** "${todaysEntry.notes}"` : ''}
${todaysEntry.vitaminsTaken ? '- ✅ Vitamins Taken' : '- ❌ Vitamins Not Logged'}
${todaysEntry.proteinShake ? '- ✅ Protein Shake Consumed' : '- ❌ Protein Shake Not Logged'}

**Exercises Performed:**
${todaysEntry.exercises.map(ex => {
  const exercise = exercises.find(e => e.id === ex.id);
  const details = [];
  if (ex.timeElapsed) details.push(`⏱️ ${ex.timeElapsed}`);
  if (ex.weight) details.push(`🏋️ ${ex.weight}`);
  if (ex.reps && ex.sets) details.push(`📊 ${ex.sets}x${ex.reps}`);
  if (ex.painLevel !== undefined && ex.painLevel !== null) details.push(`😣 Pain: ${ex.painLevel}/10`);
  if (ex.difficultyLevel !== undefined && ex.difficultyLevel !== null) details.push(`💪 Diff: ${ex.difficultyLevel}/10`);
  if (ex.bfr) details.push(`🩹 BFR`);
  return `- **${exercise?.title || ex.id}**: ${details.join(' | ')}`;
}).join('\n')}
` : `### ⏳ NO ACTIVITY LOGGED YET FOR TODAY
*Waiting for input...*`}

---

## 2. Recent History (Last 30 Days)
*Sorted Newest to Oldest*

${recentEntries.map(entry => {
    const date = new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayType = entry.isRestDay ? '😴 REST' : '💪 WORKOUT';
    
    let content = `**${date} (${dayType})**`;
    
    if (entry.notes) content += `\n   📝 "${entry.notes}"`;
    
    if (!entry.isRestDay && entry.exercises.length > 0) {
      content += '\n   ' + entry.exercises.map(ex => {
        const exercise = exercises.find(e => e.id === ex.id);
        const parts = [];
        if (ex.weight) parts.push(ex.weight);
        if (ex.sets && ex.reps) parts.push(`${ex.sets}x${ex.reps}`);
        if (ex.timeElapsed) parts.push(ex.timeElapsed);
        if (ex.painLevel) parts.push(`P:${ex.painLevel}`);
        if (ex.difficultyLevel) parts.push(`D:${ex.difficultyLevel}`);
        return `${exercise?.title || ex.id} [${parts.join(', ')}]`;
      }).join(' | ');
    }
    
    const supplements = [];
    if (entry.vitaminsTaken) supplements.push('Vit');
    if (entry.proteinShake) supplements.push('Shake');
    if (supplements.length > 0) content += `\n   💊 ${supplements.join(' + ')}`;

    return content;
  }).join('\n\n')}

---

## 3. Reference Data

### Exercise Library (Averages & Context)
*Avg Pain (P) | Avg Difficulty (D) | Total Sessions*
${exercises.map(ex => {
  const logs = entries.flatMap(e => e.exercises.filter(x => x.id === ex.id));
  const avgP = logs.length > 0 ? (logs.reduce((sum, l) => sum + (l.painLevel || 0), 0) / logs.length).toFixed(1) : 'N/A';
  const avgD = logs.length > 0 ? (logs.reduce((sum, l) => sum + (l.difficultyLevel || 0), 0) / logs.length).toFixed(1) : 'N/A';
  
  return `- **${ex.title}**
  - *Description:* ${ex.description}
  - *Stats:* P:${avgP}/10 | D:${avgD}/10 | ${logs.length} sessions`;
}).join('\n')}

### Nutrition & Wellness Settings
**Daily Vitamin Regimen:**
${settings.vitamins.map(v => `- ${v.name}: ${v.dosage} (${v.frequency})`).join('\n')}

**Protein Shake Profile:**
- **Totals:** ${Math.round(shakeTotals.calories)} cal | ${Math.round(shakeTotals.protein)}g Protein | ${Math.round(shakeTotals.carbs)}g Carbs | ${Math.round(shakeTotals.fat)}g Fat
- **Ingredients:**
${settings.proteinShake.ingredients.map(i => `  - ${i.name}: ${i.amount} (${i.protein || 0}g pro)`).join('\n')}

---

## Instructions for Analysis
1.  **Check Today:** Start by acknowledging today's work. If nothing is logged, ask if I've done my exercises.
2.  **Analyze ROM:** Look for "deg" or "degrees" in the notes or exercise titles above. Report on any ROM improvements.
3.  **Hypertrophy Check:** Am I doing enough volume (sets/reps) and progressive overload (weight) to grow my quad/calf?
4.  **Wellness Check:** Am I consistent with my vitamins and protein? Is there anything I should add or change to support muscle growth?
5.  **Feedback:** Give me 3 bullet points:
    *   **Win:** Something I did well (consistency, strength increase, low pain).
    *   **Observation:** A trend you notice (e.g., "Pain spikes when you do X").
    *   **Recommendation:** A specific tip for tomorrow (workout or wellness) to hit my hypertrophy goals.
`;

  // Structured data for AI agents (Schema.org)
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    "name": "Knee Rehabilitation Context",
    "description": "Optimized rehabilitation data export for AI analysis",
    "dateModified": new Date().toISOString(),
    "mainEntity": {
      "@type": "Dataset",
      "name": "Rehab Log",
      "description": "Exercise, pain, and recovery tracking data",
      "variableMeasured": ["Pain", "Difficulty", "ROM", "Exercise Volume"]
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <MarkdownRenderer content={markdown} />
    </>
  );
}

