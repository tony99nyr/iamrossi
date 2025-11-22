import { matchVideosToGames } from '../src/utils/videoMatcher';
import youtubeVideos from '../src/data/youtube-videos.json';

// Mock some games that should match
const mockGames = [
    {
        game_date: '2025-11-08',
        game_date_format: '2025-11-08',
        home_team_name: 'Carolina Junior Canes',
        visitor_team_name: 'Flyers Elite',
        game_nbr: 123
    },
    {
        game_date: '2025-10-25',
        game_date_format: '2025-10-25',
        home_team_name: 'Carolina Junior Canes',
        visitor_team_name: 'Windy City Storm',
        game_nbr: 456
    },
    {
        game_date: '2025-01-01', // No video for this date
        game_date_format: '2025-01-01',
        home_team_name: 'Carolina Junior Canes',
        visitor_team_name: 'Nobody',
        game_nbr: 789
    }
];

console.log('Testing video matching logic...');
const enrichedGames = matchVideosToGames(mockGames as any, youtubeVideos);

enrichedGames.forEach(game => {
    console.log(`\nGame: ${game.game_date_format} vs ${game.visitor_team_name}`);
    if (game.highlightsUrl) {
        console.log(`  Highlights: ${game.highlightsUrl}`);
    }
    if (game.fullGameUrl) {
        console.log(`  Full Game: ${game.fullGameUrl}`);
    }
    if (!game.highlightsUrl && !game.fullGameUrl) {
        console.log('  No videos found');
    }
});
