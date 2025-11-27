import { getExercises, getEntries } from '@/lib/kv';
import type { RehabSettings } from '@/types';
import { createClient } from 'redis';

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
        vitamins: [],
        proteinShake: { ingredients: [], servingSize: '' },
      };
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {
      vitamins: [],
      proteinShake: { ingredients: [], servingSize: '' },
    };
  }
}

export default async function AIContextPage() {
  const exercises = await getExercises();
  const entries = await getEntries();
  const settings = await getSettings();

  // Generate comprehensive markdown documentation
  const markdown = `# Knee Rehab Tracker - AI Context Documentation

## Overview
This document provides comprehensive context about the Knee Rehab Tracker application, its data structures, and historical data. This information is designed to be consumed by AI agents (ChatGPT, Gemini, Claude, etc.) to understand the user's rehabilitation progress and provide informed assistance.

---

## Data Model

### Exercise
An exercise is a specific rehabilitation activity that can be performed.

**Fields:**
- \`id\` (string): Unique identifier for the exercise
- \`title\` (string): Name of the exercise (e.g., "Leg extension", "Peloton bike bootcamp")
- \`description\` (string): Detailed explanation of how to perform the exercise
- \`createdAt\` (string): ISO timestamp when the exercise was created

**Total Exercises Defined:** ${exercises.length}

### Exercise Entry
When an exercise is logged for a specific date, it becomes an Exercise Entry with additional tracking data.

**Fields:**
- \`id\` (string): Reference to the Exercise ID
- \`timeElapsed\` (string, optional): Duration of the exercise (e.g., "45 min", "1:30:00")
- \`weight\` (string, optional): Weight used in pounds (e.g., "135lb", "30lb")
- \`reps\` (number, optional): Number of repetitions performed (e.g., 12)
- \`sets\` (number, optional): Number of sets completed (e.g., 4)
- \`painLevel\` (number, optional): Pain experienced during/after exercise on 0-10 scale
  - 0 = No pain
  - 1-3 = Mild discomfort
  - 4-6 = Moderate pain
  - 7-9 = Severe pain
  - 10 = Extreme/unbearable pain
- \`difficultyLevel\` (number, optional): Perceived difficulty on 1-10 scale
  - 1-3 = Easy
  - 4-6 = Moderate
  - 7-9 = Challenging
  - 10 = Maximum effort

### Rehab Entry
A daily entry that tracks all exercises performed, rest status, and supplementation.

**Fields:**
- \`id\` (string): Unique identifier for the entry
- \`date\` (string): ISO date string (YYYY-MM-DD)
- \`exercises\` (ExerciseEntry[]): Array of exercises performed that day
- \`isRestDay\` (boolean): Whether this was a designated rest day
- \`vitaminsTaken\` (boolean): Whether vitamins were taken
- \`proteinShake\` (boolean): Whether protein shake was consumed

**Total Days Logged:** ${entries.length}

### Settings

#### Vitamins
The user tracks daily vitamin supplementation.

**Fields:**
- \`name\` (string): Vitamin name (e.g., "Vitamin D3", "Fish Oil")
- \`dosage\` (string): Amount taken (e.g., "5000 IU", "1000mg")
- \`frequency\` (string): How often taken ("Daily", "Twice daily", "Weekly", "As needed")

**Current Vitamin Regimen:**
${settings.vitamins.length > 0 
  ? settings.vitamins.map(v => `- ${v.name}: ${v.dosage} (${v.frequency})`).join('\n')
  : '- No vitamins currently configured'
}

#### Protein Shake
The user tracks protein shake consumption.

**Fields:**
- \`servingSize\` (string): Size of shake (e.g., "16 oz", "500ml")
- \`ingredients\` (array): List of ingredients with amounts
  - \`name\` (string): Ingredient name
  - \`amount\` (string): Quantity used

**Current Protein Shake Recipe:**
- Serving Size: ${settings.proteinShake.servingSize || 'Not configured'}
- Ingredients:
${settings.proteinShake.ingredients.length > 0
  ? settings.proteinShake.ingredients.map(i => `  - ${i.name}: ${i.amount}`).join('\n')
  : '  - No ingredients configured'
}

---

## Exercise Library

${exercises.map(ex => `### ${ex.title}
**ID:** \`${ex.id}\`
**Description:** ${ex.description}
**Created:** ${new Date(ex.createdAt).toLocaleDateString()}
`).join('\n')}

---

## Historical Data

### Summary Statistics
- Total days logged: ${entries.length}
- Rest days: ${entries.filter(e => e.isRestDay).length}
- Active days: ${entries.filter(e => !e.isRestDay && e.exercises.length > 0).length}
- Days with vitamins: ${entries.filter(e => e.vitaminsTaken).length}
- Days with protein shake: ${entries.filter(e => e.proteinShake).length}
- Total exercise sessions: ${entries.reduce((sum, e) => sum + e.exercises.length, 0)}

### Recent Activity (Last 30 Days)
${entries
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  .slice(0, 30)
  .map(entry => {
    const date = new Date(entry.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    if (entry.isRestDay) {
      return `#### ${date} - REST DAY 😴
${entry.vitaminsTaken ? '- Vitamins taken 💊\n' : ''}${entry.proteinShake ? '- Protein shake consumed 🥤\n' : ''}`;
    }
    
    const exerciseDetails = entry.exercises.map(ex => {
      const exercise = exercises.find(e => e.id === ex.id);
      const details = [];
      if (ex.timeElapsed) details.push(`Time: ${ex.timeElapsed}`);
      if (ex.weight) details.push(`Weight: ${ex.weight}`);
      if (ex.reps && ex.sets) details.push(`${ex.reps}x${ex.sets}`);
      if (ex.painLevel !== undefined) details.push(`Pain: ${ex.painLevel}/10`);
      if (ex.difficultyLevel !== undefined) details.push(`Difficulty: ${ex.difficultyLevel}/10`);
      
      return `- **${exercise?.title || ex.id}**${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
    }).join('\n');
    
    return `#### ${date}
${exerciseDetails}
${entry.vitaminsTaken ? '- Vitamins taken 💊\n' : ''}${entry.proteinShake ? '- Protein shake consumed 🥤\n' : ''}`;
  }).join('\n\n')}

---

## Usage Notes for AI Agents

### Context Understanding
- This is a **knee rehabilitation tracker** for post-injury or post-surgery recovery
- The user is tracking exercises, pain levels, difficulty, and supplementation
- Lower pain levels and higher difficulty tolerance generally indicate progress
- Rest days are important for recovery and should not be discouraged

### Data Interpretation
- **Pain Level Trends**: Decreasing pain over time is positive progress
- **Difficulty Level Trends**: Ability to handle higher difficulty indicates strength gains
- **Weight/Reps/Sets**: Increasing these metrics shows progressive overload
- **Time Elapsed**: Longer cardio sessions may indicate improved endurance
- **Consistency**: Regular logging and adherence to vitamin/protein regimen shows commitment

### Helpful Responses
When the user asks about their progress:
1. Analyze trends in pain and difficulty levels
2. Note improvements in weight, reps, or sets for strength exercises
3. Acknowledge consistency in supplementation
4. Identify any concerning patterns (e.g., increasing pain)
5. Provide evidence-based encouragement or suggestions

### Example Insights
- "Your pain levels have decreased from 6/10 to 3/10 over the past two weeks on leg extensions"
- "You've progressed from 30lb to 35lb on BFR exercises while maintaining low pain"
- "You've been consistent with vitamins for 15 consecutive days"
- "Consider a rest day - you've had 7 consecutive active days"

---

*Last Updated: ${new Date().toISOString()}*
*Total Data Points: ${entries.reduce((sum, e) => sum + e.exercises.length, 0)} exercise sessions across ${entries.length} days*
`;

  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '40px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#0a0a0a',
      color: '#ededed',
      minHeight: '100vh',
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '32px',
      }}>
        <pre style={{
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          fontSize: '14px',
          lineHeight: '1.6',
          margin: 0,
          fontFamily: 'ui-monospace, monospace',
        }}>
          {markdown}
        </pre>
      </div>
    </div>
  );
}
