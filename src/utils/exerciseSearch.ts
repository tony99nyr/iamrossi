interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface SearchResult {
    exercise: Exercise;
    score: number;
}

/**
 * Fuzzy search exercises by title and description
 * Returns exercises ranked by relevance
 */
export function searchExercises(query: string, exercises: Exercise[]): Exercise[] {
    if (!query.trim()) {
        return exercises;
    }

    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const exercise of exercises) {
        let score = 0;
        const lowerTitle = exercise.title.toLowerCase();
        const lowerDesc = exercise.description.toLowerCase();

        // Exact match in title gets highest score
        if (lowerTitle === lowerQuery) {
            score = 1000;
        }
        // Title starts with query
        else if (lowerTitle.startsWith(lowerQuery)) {
            score = 500;
        }
        // Title contains query
        else if (lowerTitle.includes(lowerQuery)) {
            score = 300;
        }
        // Description contains query
        else if (lowerDesc.includes(lowerQuery)) {
            score = 100;
        }
        // Fuzzy match - check if all query characters appear in order
        else if (fuzzyMatch(lowerQuery, lowerTitle)) {
            score = 50;
        }
        else if (fuzzyMatch(lowerQuery, lowerDesc)) {
            score = 25;
        }

        if (score > 0) {
            results.push({ exercise, score });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results.map(r => r.exercise);
}

/**
 * Check if all characters in query appear in target in order
 */
function fuzzyMatch(query: string, target: string): boolean {
    let queryIndex = 0;
    
    for (let i = 0; i < target.length && queryIndex < query.length; i++) {
        if (target[i] === query[queryIndex]) {
            queryIndex++;
        }
    }
    
    return queryIndex === query.length;
}
