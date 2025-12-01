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

  // Calculate shake totals
  const shakeTotals = settings.proteinShake.ingredients.reduce((acc, curr) => ({
    calories: acc.calories + (curr.calories || 0),
    protein: acc.protein + (curr.protein || 0),
    carbs: acc.carbs + (curr.carbs || 0),
    fat: acc.fat + (curr.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Generate comprehensive markdown documentation with verbose field descriptions
  const markdown = `# Knee Rehab Tracker - AI Context Documentation

## Overview
This document provides comprehensive context about the Knee Rehab Tracker application, its data structures, and historical data. This information is designed to be consumed by AI agents (ChatGPT, Gemini, Claude, etc.) to understand the user's rehabilitation progress and provide informed assistance.

**Purpose:** This page serves as a complete data export and documentation resource that AI agents can read to understand my knee rehabilitation journey, track progress over time, and provide personalized insights based on actual historical data.

---

## Data Model

### Exercise
An exercise represents a specific rehabilitation activity that I can perform as part of my recovery program. Each exercise is a reusable template that I can log multiple times across different dates.

**Fields:**
- **\`id\`** (string): Unique identifier for the exercise
  - *Intent:* Allows me to reference the same exercise across multiple daily entries without duplicating the title and description
  - *Example:* \`"leg-extension-123"\`

- **\`title\`** (string): Human-readable name of the exercise
  - *Intent:* Quick identification of what exercise this is
  - *Example:* "Leg extension", "Peloton bike bootcamp", "BFR leg press"

- **\`description\`** (string): Detailed explanation of how to perform the exercise
  - *Intent:* Provides instructions, form cues, or notes about the exercise so I remember proper technique
  - *Example:* "Seated leg extension machine. Focus on controlled movement, pause at top for 2 seconds."

- **\`createdAt\`** (string): ISO 8601 timestamp when the exercise was first added to my library
  - *Intent:* Tracks when I started incorporating this exercise into my routine
  - *Example:* \`"2024-11-15T10:30:00.000Z"\`

**Total Exercises Defined:** ${exercises.length}

---

### Exercise Entry
When I log an exercise for a specific date, it becomes an Exercise Entry with additional tracking data. This is where I record the actual work I did—how long, how heavy, how many reps, and how it felt.

**Fields:**
- **\`id\`** (string): Reference to the parent Exercise ID
  - *Intent:* Links this logged instance back to the exercise definition
  - *Example:* \`"leg-extension-123"\`

- **\`timeElapsed\`** (string, optional): Duration of the exercise session
  - *Intent:* Tracks how long I spent on cardio or timed exercises (like Peloton rides)
  - *Format:* Free-form string to accommodate various formats
  - *Examples:* "45 min", "1:30:00", "90 minutes"

- **\`weight\`** (string, optional): Weight used during the exercise
  - *Intent:* Tracks progressive overload for strength exercises. Increasing weight over time indicates strength gains.
  - *Format:* Free-form string to allow flexibility (usually includes "lb" or "kg")
  - *Examples:* "135lb", "30lb", "60 kg"

- **\`reps\`** (number, optional): Number of repetitions performed per set
  - *Intent:* Tracks volume for strength exercises. Combined with sets and weight, this shows total work performed.
  - *Example:* 12 (meaning I did 12 repetitions per set)

- **\`sets\`** (number, optional): Number of sets completed
  - *Intent:* Tracks total volume. More sets = more total work.
  - *Example:* 4 (meaning I did 4 sets of the exercise)

- **\`painLevel\`** (number, optional): Pain experienced during or after the exercise on a 0-10 scale
  - *Intent:* **Critical for tracking recovery progress.** Decreasing pain levels over time indicate healing. Sudden increases may signal overtraining or injury.
  - *Scale:*
    - **0** = No pain at all
    - **1-3** = Mild discomfort, barely noticeable
    - **4-6** = Moderate pain, noticeable but manageable
    - **7-9** = Severe pain, significantly impacts movement
    - **10** = Extreme/unbearable pain, cannot continue
  - *Example:* 3 (mild discomfort, but manageable)

- **\`difficultyLevel\`** (number, optional): Perceived difficulty of the exercise on a 1-10 scale
  - *Intent:* **Tracks effort and progression.** As I get stronger, exercises that were once a 9/10 difficulty should become 5/10 or 6/10. This is separate from pain—an exercise can be difficult but not painful.
  - *Scale:*
    - **1-3** = Easy, could do much more
    - **4-6** = Moderate effort, challenging but sustainable
    - **7-9** = Very challenging, near maximum effort
    - **10** = Maximum effort, couldn't do one more rep
  - *Example:* 7 (challenging, but I completed all sets)

- **\`bfr\`** (boolean, optional): Whether Blood Flow Restriction (BFR) training was used
  - *Intent:* BFR training involves using bands to restrict blood flow during exercise, allowing strength gains with lighter weights. I track this separately because BFR exercises require different recovery considerations.
  - *Example:* \`true\` (I used BFR bands during this exercise)

**Note:** All optional fields allow me to track different types of exercises flexibly. Cardio might only have \`timeElapsed\`, while strength training might have \`weight\`, \`reps\`, and \`sets\`.

---

### Rehab Entry
A daily entry represents everything I did on a specific date. This is the top-level container for each day's workout, rest status, and supplementation.

**Fields:**
- **\`id\`** (string): Unique identifier for this daily entry
  - *Intent:* Allows me to reference and update specific days
  - *Example:* \`"entry-2024-11-20"\`

- **\`date\`** (string): ISO 8601 date string (YYYY-MM-DD format)
  - *Intent:* The calendar date this entry represents. This is the primary key for organizing my rehab timeline.
  - *Example:* \`"2024-11-20"\`

- **\`exercises\`** (ExerciseEntry[]): Array of all exercises I performed that day
  - *Intent:* Stores the complete workout log for the day. Can be empty if it was a rest day or if I only tracked vitamins/protein.
  - *Example:* \`[{id: "leg-extension-123", weight: "30lb", reps: 12, sets: 4, painLevel: 3}]\`

- **\`isRestDay\`** (boolean): Whether this was a designated rest day
  - *Intent:* **Rest days are crucial for recovery.** Tracking them helps me ensure I'm not overtraining and allows AI agents to recommend rest when I've had too many consecutive active days.
  - *Example:* \`true\` (I intentionally rested this day)

- **\`vitaminsTaken\`** (boolean): Whether I took my vitamins that day
  - *Intent:* Tracks adherence to my supplement regimen. Consistency with vitamins supports recovery and overall health.
  - *Example:* \`true\` (I took my vitamins)

- **\`proteinShake\`** (boolean): Whether I consumed my protein shake that day
  - *Intent:* Tracks protein intake, which is essential for muscle recovery and growth. Consistency here supports strength gains.
  - *Example:* \`true\` (I had my protein shake)

- **\`notes\`** (string, optional): General notes about the day
  - *Intent:* **Free-form text field for tracking thoughts, concerns, pain observations, and general feelings about the day.** This is where I record lingering pain from previous days, worries about recovery, or any observations that don't fit into structured fields.
  - *Examples:* "Knee felt stiff in the morning but loosened up after warmup", "Had lingering pain from yesterday's workout", "Feeling stronger today, no discomfort during stairs"
  - *Use Cases:*
    - Tracking pain that isn't tied to a specific exercise
    - Recording concerns or worries about recovery progress
    - Noting environmental factors (weather, sleep quality, stress)
    - Documenting how the knee feels throughout the day

**Total Days Logged:** ${entries.length}

---

### Settings

#### Vitamins
I track daily vitamin supplementation to support recovery and overall health. This section defines what vitamins I'm taking and how often.

**Fields:**
- **\`name\`** (string): Name of the vitamin or supplement
  - *Intent:* Identifies what I'm taking
  - *Examples:* "Vitamin D3", "Fish Oil", "Magnesium", "Glucosamine"

- **\`dosage\`** (string): Amount taken per serving
  - *Intent:* Tracks how much I'm taking to ensure I'm meeting recommended levels
  - *Examples:* "5000 IU", "1000mg", "2 capsules"

- **\`frequency\`** (string): How often I take this vitamin
  - *Intent:* Defines the expected schedule so I can track adherence
  - *Options:* "Daily", "Twice daily", "Weekly", "As needed"

**Current Vitamin Regimen:**
${settings.vitamins.length > 0 
  ? settings.vitamins.map(v => `- **${v.name}**: ${v.dosage} (${v.frequency})${v.notes ? ` - *${v.notes}*` : ''}`).join('\n')
  : '- *No vitamins currently configured*'
}

---

#### Protein Shake
I track protein shake consumption because protein is essential for muscle recovery and growth after workouts. This section defines my standard protein shake recipe.

**Fields:**
- **\`servingSize\`** (string): Size of the shake I make
  - *Intent:* Provides context for the total nutrition
  - *Examples:* "16 oz", "500ml", "2 cups"

- **\`ingredients\`** (array): List of ingredients with their amounts
  - **\`name\`** (string): Ingredient name
    - *Examples:* "Whey protein powder", "Banana", "Almond milk", "Peanut butter"
  - **\`amount\`** (string): Quantity used
    - *Examples:* "1 scoop", "1 medium", "12 oz", "2 tbsp"

**Current Protein Shake Recipe:**
- **Serving Size:** ${settings.proteinShake.servingSize || '*Not configured*'}
- **Total Nutrition:** ${Math.round(shakeTotals.calories)} cals | ${Math.round(shakeTotals.protein)}g protein | ${Math.round(shakeTotals.carbs)}g carbs | ${Math.round(shakeTotals.fat)}g fat
- **Ingredients:**
${settings.proteinShake.ingredients.length > 0
  ? settings.proteinShake.ingredients.map(i => {
      const macros = [];
      if (i.calories) macros.push(`${i.calories} cals`);
      if (i.protein) macros.push(`${i.protein}g prot`);
      if (i.carbs) macros.push(`${i.carbs}g carb`);
      if (i.fat) macros.push(`${i.fat}g fat`);
      const macroStr = macros.length > 0 ? ` (${macros.join(', ')})` : '';
      const noteStr = i.notes ? ` - *${i.notes}*` : '';
      return `  - **${i.name}**: ${i.amount}${macroStr}${noteStr}`;
    }).join('\n')
  : '  - *No ingredients configured*'
}

---

## Exercise Library

Below is the complete list of all exercises I've defined in my rehabilitation program. Each exercise can be logged multiple times across different dates. **Pain and difficulty levels shown are averages from all logged sessions.**

${exercises.map(ex => {
  // Calculate average pain and difficulty for this exercise
  const exerciseLogs = entries.flatMap(entry => 
    entry.exercises.filter(e => e.id === ex.id)
  );
  
  const painLevels = exerciseLogs
    .map(log => log.painLevel)
    .filter(p => p !== undefined && p !== null && p > 0) as number[];
  
  const difficultyLevels = exerciseLogs
    .map(log => log.difficultyLevel)
    .filter(d => d !== undefined && d !== null) as number[];
  
  const avgPain = painLevels.length > 0 
    ? (painLevels.reduce((sum, p) => sum + p, 0) / painLevels.length).toFixed(1)
    : null;
  
  const avgDifficulty = difficultyLevels.length > 0
    ? (difficultyLevels.reduce((sum, d) => sum + d, 0) / difficultyLevels.length).toFixed(1)
    : null;
  
  const timesLogged = exerciseLogs.length;
  
  return `### ${ex.title}
**ID:** \`${ex.id}\`  
**Description:** ${ex.description}  
**Created:** ${new Date(ex.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}  
**Times Logged:** ${timesLogged}${timesLogged > 0 ? ` session${timesLogged > 1 ? 's' : ''}` : ' (never logged)'}  
${avgPain !== null ? `**Average Pain Level:** ${avgPain}/10 😣  \n` : ''}${avgDifficulty !== null ? `**Average Difficulty:** ${avgDifficulty}/10 💪` : ''}
`;
}).join('\n')}

---

## Historical Data

### Summary Statistics
These statistics provide a high-level overview of my rehabilitation journey:

- **Total days logged:** ${entries.length} (every day I've tracked in the system)
- **Rest days:** ${entries.filter(e => e.isRestDay).length} (days I intentionally rested)
- **Active days:** ${entries.filter(e => !e.isRestDay && e.exercises.length > 0).length} (days I performed exercises)
- **Days with vitamins:** ${entries.filter(e => e.vitaminsTaken).length} (adherence to supplement regimen)
- **Days with protein shake:** ${entries.filter(e => e.proteinShake).length} (adherence to protein intake)
- **Total exercise sessions:** ${entries.reduce((sum, e) => sum + e.exercises.length, 0)} (total number of individual exercises logged across all days)

---

### Recent Activity (Last 30 Days)
This section shows my most recent rehabilitation activity, sorted from newest to oldest. This is the most relevant data for understanding my current progress and trends.

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
${entry.vitaminsTaken ? '- ✅ Vitamins taken 💊\n' : ''}${entry.proteinShake ? '- ✅ Protein shake consumed 🥤\n' : ''}${entry.notes ? `\n**Notes:** ${entry.notes}\n` : ''}`;
    }
    
    const exerciseDetails = entry.exercises.map(ex => {
      const exercise = exercises.find(e => e.id === ex.id);
      const details = [];
      if (ex.timeElapsed) details.push(`⏱️ ${ex.timeElapsed}`);
      if (ex.weight) details.push(`🏋️ ${ex.weight}`);
      if (ex.reps && ex.sets) details.push(`📊 ${ex.sets} sets × ${ex.reps} reps`);
      if (ex.painLevel !== undefined) details.push(`😣 Pain: ${ex.painLevel}/10`);
      if (ex.difficultyLevel !== undefined) details.push(`💪 Difficulty: ${ex.difficultyLevel}/10`);
      if (ex.bfr) details.push(`🩹 BFR`);
      
      return `- **${exercise?.title || ex.id}**${details.length > 0 ? `\n  - ${details.join(' • ')}` : ''}`;
    }).join('\n');
    
    return `#### ${date}
${exerciseDetails}
${entry.vitaminsTaken ? '- ✅ Vitamins taken 💊\n' : ''}${entry.proteinShake ? '- ✅ Protein shake consumed 🥤\n' : ''}${entry.notes ? `\n**Notes:** ${entry.notes}\n` : ''}`;
  }).join('\n\n')}

---

## Usage Notes for AI Agents

### Context Understanding
- This is a **knee rehabilitation tracker** for post-injury or post-surgery recovery
- I am tracking exercises, pain levels, difficulty, and supplementation to monitor my recovery progress
- **Lower pain levels** and **higher difficulty tolerance** over time generally indicate positive progress
- **Rest days are important** for recovery and should not be discouraged—they are part of the plan

### Data Interpretation Guidelines

#### Pain Level Trends
- **Decreasing pain over time** = Positive progress, healing is occurring
- **Stable low pain** = Good sign, exercise is not aggravating the injury
- **Increasing pain** = Warning sign, may indicate overtraining or improper form
- **Pain spikes after rest days** = May indicate need for better warm-up or gradual return

#### Difficulty Level Trends
- **Ability to handle higher difficulty** = Strength and endurance gains
- **Same difficulty feels easier over time** = Adaptation and progress
- **Difficulty increasing while pain stays low** = Ideal scenario—getting stronger without aggravating injury

#### Weight/Reps/Sets Progression
- **Increasing weight** = Progressive overload, building strength
- **Increasing reps/sets** = Building endurance and work capacity
- **Maintaining weight with lower pain** = Improved tolerance and recovery

#### Time Elapsed (Cardio)
- **Longer sessions** = Improved cardiovascular endurance
- **Same duration with lower difficulty rating** = Improved fitness

#### Consistency Metrics
- **Regular vitamin/protein adherence** = Commitment to recovery nutrition
- **Consistent logging** = Engagement with the rehabilitation process
- **Balance of active and rest days** = Smart training approach

### Helpful Response Patterns

When I ask about my progress, please:
1. **Analyze trends** in pain and difficulty levels over the past 2-4 weeks
2. **Note improvements** in weight, reps, sets, or time for specific exercises
3. **Acknowledge consistency** in supplementation and logging
4. **Identify concerning patterns** (e.g., increasing pain, too many consecutive active days)
5. **Provide evidence-based encouragement** or suggestions based on the actual data

### Example Insights You Can Provide

- "Your pain levels on leg extensions have decreased from 6/10 to 3/10 over the past two weeks—great progress!"
- "You've progressed from 30lb to 35lb on BFR exercises while maintaining low pain levels (3/10). This shows excellent strength gains without aggravating your knee."
- "You've been consistent with vitamins for 15 consecutive days—this supports your recovery."
- "You've had 7 consecutive active days. Consider taking a rest day tomorrow to allow for recovery."
- "Your difficulty ratings on Peloton rides have decreased from 8/10 to 6/10 over the past month while maintaining the same duration—your endurance is improving!"

---

## Important Notes

- **BFR (Blood Flow Restriction) Training:** When I mark an exercise with \`bfr: true\`, it means I used BFR bands. These exercises allow strength gains with lighter weights but require careful monitoring.
- **Pain vs. Difficulty:** These are separate metrics. An exercise can be difficult (high effort) but not painful, which is ideal. Pain should trend downward over time.
- **Rest Days:** These are intentional and important. Don't suggest I work out every day—recovery is part of the program.

---

*Last Updated: ${new Date().toISOString()}*  
*Total Data Points: ${entries.reduce((sum, e) => sum + e.exercises.length, 0)} exercise sessions across ${entries.length} days*
`;

  // Structured data for AI agents
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    "name": "Knee Rehabilitation Tracking Data",
    "description": "Comprehensive rehabilitation tracking data for knee injury recovery",
    "dateModified": new Date().toISOString(),
    "about": {
      "@type": "MedicalCondition",
      "name": "Knee Rehabilitation",
      "possibleTreatment": {
        "@type": "TherapeuticProcedure",
        "name": "Physical Therapy and Exercise Rehabilitation"
      }
    },
    "mainEntity": {
      "@type": "Dataset",
      "name": "Rehabilitation Exercise Data",
      "description": "Historical exercise tracking data including pain levels, difficulty ratings, and progress metrics",
      "temporalCoverage": entries.length > 0 
        ? `${entries[entries.length - 1]?.date}/${entries[0]?.date}`
        : undefined,
      "variableMeasured": [
        "Pain Level (0-10 scale)",
        "Difficulty Level (1-10 scale)",
        "Exercise Weight (pounds)",
        "Repetitions",
        "Sets",
        "Time Elapsed",
        "Vitamin Adherence",
        "Protein Intake"
      ],
      "distribution": {
        "@type": "DataDownload",
        "encodingFormat": "text/markdown",
        "contentUrl": "/tools/knee-rehab/ai"
      }
    },
    "keywords": [
      "knee rehabilitation",
      "physical therapy tracking",
      "pain level monitoring",
      "exercise progression",
      "recovery metrics",
      "BFR training",
      "rehabilitation data"
    ]
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

