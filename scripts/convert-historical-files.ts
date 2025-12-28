import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';

const HISTORICAL_DATA_DIR = path.join(process.cwd(), 'data', 'historical-prices');

async function convertFile() {
  const filePath = path.join(HISTORICAL_DATA_DIR, 'ethusdt', '1d', '2025-12-28_2025-12-28.json');
  
  try {
    // Read the existing JSON file
    const data = await fs.readFile(filePath, 'utf-8');
    const candles = JSON.parse(data);
    
    // Compress and save as .gz
    const compressed = gzipSync(data);
    const gzPath = `${filePath}.gz`;
    await fs.writeFile(gzPath, compressed);
    
    console.log(`✅ Converted ${filePath} to ${gzPath}`);
    
    // Delete the uncompressed file
    await fs.unlink(filePath);
    console.log(`✅ Deleted uncompressed file: ${filePath}`);
    
    console.log(`\n📊 File contains ${candles.length} candle(s)`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`ℹ️  File ${filePath} does not exist (may have already been converted)`);
    } else {
      console.error('❌ Error converting file:', error);
      throw error;
    }
  }
}

convertFile().catch(console.error);

