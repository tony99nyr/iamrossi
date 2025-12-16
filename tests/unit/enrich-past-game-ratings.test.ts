import { describe, it, expect } from 'vitest';
import { enrichPastGameWithRatings } from '@/app/tools/next-game/page';
import type { Game } from '@/types';

/**
 * Helper to create a minimal game object for testing
 */
function createGame(overrides: Partial<Game> = {}): Game {
    return {
        game_nbr: '12345',
        game_date: '2025-10-24',
        game_date_format: '10/24/2025',
        game_time: '7:00 PM',
        game_time_format: '7:00 PM',
        game_time_format_pretty: '7:00 PM',
        home_team_name: 'Home Team',
        visitor_team_name: 'Visitor Team',
        game_home_team: '19758', // Jr Canes team ID
        game_visitor_team: '20001', // Opponent team ID
        ...overrides,
    } as Game;
}

describe('enrichPastGameWithRatings', () => {
    const ourTeamId = '19758'; // Jr Canes team ID
    
    describe('when we are home team', () => {
        it('should add ratings when MHR game has none', () => {
            const mhrGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                game_home_team: '19758', // We are home
                game_visitor_team: '20001',
            });
            
            const enrichedGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                game_home_team: '19758',
                game_visitor_team: '20001',
                home_team_rating: '93.5',
                home_team_record: '10-2-1',
                visitor_team_rating: '89.0',
                visitor_team_record: '8-4-0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Should add ratings without changing anything else
            expect(result.home_team_name).toBe('Jr Canes 10U Black');
            expect(result.visitor_team_name).toBe('Indiana Elite');
            expect(result.home_team_rating).toBe('93.5');
            expect(result.home_team_record).toBe('10-2-1');
            expect(result.visitor_team_rating).toBe('89.0');
            expect(result.visitor_team_record).toBe('8-4-0');
        });
        
        it('should preserve existing MHR ratings (not overwrite)', () => {
            const mhrGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                home_team_rating: '94.0', // MHR has different rating
                home_team_record: '11-2-1',
            });
            
            const enrichedGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                home_team_rating: '93.5',
                home_team_record: '10-2-1',
                visitor_team_rating: '89.0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Should NOT overwrite existing MHR values
            expect(result.home_team_rating).toBe('94.0');
            expect(result.home_team_record).toBe('11-2-1');
            // Should add missing visitor rating
            expect(result.visitor_team_rating).toBe('89.0');
        });
        
        it('should NOT modify team names', () => {
            const mhrGame = createGame({
                home_team_name: 'Carolina Jr Canes (Black) 10U AA',
                visitor_team_name: 'Indiana Elite 10U AAA',
            });
            
            const enrichedGame = createGame({
                home_team_name: 'Carolina Junior Canes Black 10U AA',
                visitor_team_name: 'Indiana Elite 10U AAA',
                home_team_rating: '93.5',
                visitor_team_rating: '89.0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Team names must stay as MHR had them
            expect(result.home_team_name).toBe('Carolina Jr Canes (Black) 10U AA');
            expect(result.visitor_team_name).toBe('Indiana Elite 10U AAA');
        });
        
        it('should NOT modify team IDs', () => {
            const mhrGame = createGame({
                game_home_team: '19758',
                game_visitor_team: '20001',
            });
            
            const enrichedGame = createGame({
                game_home_team: '12345', // Different ID in enriched (shouldn't matter)
                game_visitor_team: '67890',
                home_team_rating: '93.5',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Team IDs must stay as MHR had them
            expect(result.game_home_team).toBe('19758');
            expect(result.game_visitor_team).toBe('20001');
        });
        
        it('should NOT modify scores', () => {
            const mhrGame = createGame({
                home_team_score: 5,
                visitor_team_score: 2,
            });
            
            const enrichedGame = createGame({
                home_team_score: 2, // Wrong scores
                visitor_team_score: 5,
                home_team_rating: '93.0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Scores must stay as MHR had them
            expect(result.home_team_score).toBe(5);
            expect(result.visitor_team_score).toBe(2);
        });
    });
    
    describe('when we are visitor team', () => {
        it('should correctly apply ratings when we are visitor', () => {
            // MHR says: Jr Canes = VISITOR, Indiana = HOME
            const mhrGame = createGame({
                home_team_name: 'Indiana Elite',
                visitor_team_name: 'Jr Canes 10U Black',
                game_home_team: '20001', // Indiana is home
                game_visitor_team: '19758', // We are visitor
            });
            
            // Enriched also has same orientation
            const enrichedGame = createGame({
                home_team_name: 'Indiana Elite',
                visitor_team_name: 'Jr Canes 10U Black',
                game_home_team: '20001',
                game_visitor_team: '19758',
                home_team_rating: '89.0', // Indiana's rating
                home_team_record: '8-4-0',
                visitor_team_rating: '93.5', // Jr Canes' rating
                visitor_team_record: '10-2-1',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Should NOT swap anything from MHR
            expect(result.home_team_name).toBe('Indiana Elite');
            expect(result.visitor_team_name).toBe('Jr Canes 10U Black');
            expect(result.game_home_team).toBe('20001');
            expect(result.game_visitor_team).toBe('19758');
            
            // Should correctly assign ratings
            expect(result.home_team_rating).toBe('89.0'); // Indiana
            expect(result.visitor_team_rating).toBe('93.5'); // Jr Canes
        });
        
        it('should handle swapped orientation between MHR and enriched', () => {
            // MHR says: Jr Canes = VISITOR, Indiana = HOME
            const mhrGame = createGame({
                home_team_name: 'Indiana Elite',
                visitor_team_name: 'Jr Canes 10U Black',
                game_home_team: '20001', // Indiana is home
                game_visitor_team: '19758', // We are visitor
                home_team_score: 8,
                visitor_team_score: 2,
            });
            
            // Enriched has SWAPPED orientation (calendar thought we were home)
            const enrichedGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                game_home_team: '19758', // We are home in enriched
                game_visitor_team: '20001',
                home_team_rating: '93.5', // Jr Canes (us)
                visitor_team_rating: '89.0', // Indiana
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // MHR data should be preserved (Indiana is home, we are visitor)
            expect(result.home_team_name).toBe('Indiana Elite');
            expect(result.visitor_team_name).toBe('Jr Canes 10U Black');
            expect(result.home_team_score).toBe(8);
            expect(result.visitor_team_score).toBe(2);
            expect(result.game_home_team).toBe('20001');
            expect(result.game_visitor_team).toBe('19758');
            
            // Ratings should be matched using team IDs, not position
            // Our rating (93.5) goes to visitor position, opponent (89.0) to home
            expect(result.home_team_rating).toBe('89.0'); // Indiana
            expect(result.visitor_team_rating).toBe('93.5'); // Jr Canes
        });
        
        it('should NOT swap scores even when orientations differ', () => {
            const mhrGame = createGame({
                home_team_name: 'Indiana Elite',
                visitor_team_name: 'Jr Canes 10U Black',
                game_home_team: '20001',
                game_visitor_team: '19758',
                home_team_score: 8, // Indiana scored 8
                visitor_team_score: 2, // We scored 2
            });
            
            const enrichedGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                game_home_team: '19758',
                game_visitor_team: '20001',
                home_team_score: 2, // Swapped in enriched
                visitor_team_score: 8,
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Scores must remain as MHR has them
            expect(result.home_team_score).toBe(8);
            expect(result.visitor_team_score).toBe(2);
        });
    });
    
    describe('edge cases', () => {
        it('should handle missing enriched data gracefully', () => {
            const mhrGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                home_team_rating: '93.0',
            });
            
            const enrichedGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                // No ratings in enriched
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Should keep existing MHR rating
            expect(result.home_team_rating).toBe('93.0');
            // Should not add undefined values
            expect(result.visitor_team_rating).toBeUndefined();
        });
        
        it('should handle when enriched has no team ID for us', () => {
            const mhrGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
            });
            
            // Enriched has different team IDs (we're not in it)
            const enrichedGame = createGame({
                home_team_name: 'Jr Canes 10U Black',
                visitor_team_name: 'Indiana Elite',
                game_home_team: '99999', // Not our team
                game_visitor_team: '88888',
                home_team_rating: '93.5',
                visitor_team_rating: '89.0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Should not apply ratings if we can't find ourselves in enriched
            expect(result.home_team_rating).toBeUndefined();
            expect(result.visitor_team_rating).toBeUndefined();
        });
        
        it('should set opponent_rating and opponent_record correctly when we are home', () => {
            const mhrGame = createGame({
                game_home_team: '19758', // We are home
                game_visitor_team: '20001',
            });
            
            const enrichedGame = createGame({
                game_home_team: '19758',
                game_visitor_team: '20001',
                home_team_rating: '93.5',
                home_team_record: '10-2-1',
                visitor_team_rating: '89.0',
                visitor_team_record: '8-4-0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Opponent is the visitor
            expect(result.opponent_rating).toBe('89.0');
            expect(result.opponent_record).toBe('8-4-0');
        });
        
        it('should set opponent_rating and opponent_record correctly when we are visitor', () => {
            const mhrGame = createGame({
                game_home_team: '20001', // Opponent is home
                game_visitor_team: '19758', // We are visitor
            });
            
            const enrichedGame = createGame({
                game_home_team: '20001',
                game_visitor_team: '19758',
                home_team_rating: '89.0',
                home_team_record: '8-4-0',
                visitor_team_rating: '93.5',
                visitor_team_record: '10-2-1',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, ourTeamId);
            
            // Opponent is the home team
            expect(result.opponent_rating).toBe('89.0');
            expect(result.opponent_record).toBe('8-4-0');
        });
    });
    
    describe('real-world scenarios', () => {
        it('should handle Oct 24 Indiana Elite game correctly', () => {
            // MHR data shows actual game result - we are home
            const mhrGame = createGame({
                game_nbr: '1256330',
                home_team_name: 'Carolina Jr Canes (Black) 10U AA',
                visitor_team_name: 'Indiana Elite 10U AAA',
                game_home_team: '19758', // Jr Canes
                game_visitor_team: '20159', // Indiana
                home_team_score: 2,
                visitor_team_score: 8,
            });
            
            // Calendar sync enriched data
            const enrichedGame = createGame({
                home_team_name: 'Carolina Jr Canes (Black) 10U AA',
                visitor_team_name: 'Indiana Elite 10U AAA',
                game_home_team: '19758',
                game_visitor_team: '20159',
                home_team_rating: '93.2',
                home_team_record: '12-2-1',
                visitor_team_rating: '95.5',
                visitor_team_record: '15-1-0',
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, '19758');
            
            // All MHR data should be preserved
            expect(result.home_team_name).toBe('Carolina Jr Canes (Black) 10U AA');
            expect(result.visitor_team_name).toBe('Indiana Elite 10U AAA');
            expect(result.home_team_score).toBe(2);
            expect(result.visitor_team_score).toBe(8);
            expect(result.game_home_team).toBe('19758');
            
            // Ratings should be added correctly
            expect(result.home_team_rating).toBe('93.2');
            expect(result.visitor_team_rating).toBe('95.5');
        });
        
        it('should handle game where we are away team correctly', () => {
            // MHR data: we (Jr Canes) are the visitor
            const mhrGame = createGame({
                game_nbr: '1256331',
                home_team_name: 'Indiana Elite 10U AAA',
                visitor_team_name: 'Carolina Jr Canes (Black) 10U AA',
                game_home_team: '20159', // Indiana
                game_visitor_team: '19758', // Jr Canes
                home_team_score: 8,
                visitor_team_score: 2,
            });
            
            // Calendar sync might have different orientation (thinks we're home)
            const enrichedGame = createGame({
                home_team_name: 'Carolina Jr Canes (Black) 10U AA',
                visitor_team_name: 'Indiana Elite 10U AAA',
                game_home_team: '19758',
                game_visitor_team: '20159',
                home_team_rating: '93.2', // Jr Canes
                visitor_team_rating: '95.5', // Indiana
            });
            
            const result = enrichPastGameWithRatings(mhrGame, enrichedGame, '19758');
            
            // MHR data should be preserved (Indiana is home, we are visitor)
            expect(result.home_team_name).toBe('Indiana Elite 10U AAA');
            expect(result.visitor_team_name).toBe('Carolina Jr Canes (Black) 10U AA');
            expect(result.home_team_score).toBe(8);
            expect(result.visitor_team_score).toBe(2);
            expect(result.game_home_team).toBe('20159');
            expect(result.game_visitor_team).toBe('19758');
            
            // Ratings should be matched by team ID
            expect(result.home_team_rating).toBe('95.5'); // Indiana
            expect(result.visitor_team_rating).toBe('93.2'); // Jr Canes
        });
    });
});
