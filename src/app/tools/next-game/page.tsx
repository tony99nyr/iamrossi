import fs from 'fs';
import path from 'path';
import NextGameClient from './NextGameClient';

async function getSchedule() {
    const filePath = path.join(process.cwd(), 'src/data/schedule.json');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
}

export default async function NextGamePage() {
    const schedule = await getSchedule();
    
    // Filter for future games
    const now = new Date();
    const futureGames = schedule.filter((game: any) => {
        const gameDateTime = new Date(`${game.game_date_format}T${game.game_time_format}`);
        return gameDateTime >= now;
    }).sort((a: any, b: any) => {
        const dateA = new Date(`${a.game_date_format}T${a.game_time_format}`);
        const dateB = new Date(`${b.game_date_format}T${b.game_time_format}`);
        return dateA.getTime() - dateB.getTime();
    });

    return <NextGameClient futureGames={futureGames} />;
}
