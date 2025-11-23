# CLAUDE.md

## Repository Overview
- **Project**: `iamrossi` - A Next.js personal dashboard and utility site.
- **Tech Stack**:
    - **Framework**: Next.js 15 (App Router)
    - **Language**: TypeScript
    - **Styling**: Panda CSS (Atomic CSS-in-JS). *Do not use CSS Modules or inline styles unless absolutely necessary.*
    - **Package Manager**: pnpm
- **Key Directories**:
    - `src/app`: App Router pages and layouts.
    - `src/components`: Reusable UI components.
    - `src/app/tools`: Feature-specific tools (see below).
    - `styled-system`: Panda CSS generated files.

## Operational Constraints (CRITICAL)
- **Environment**: WSL2 (Ubuntu) on Windows.
- **Browser**: **NO INTEGRATED BROWSER**. The user cannot open a browser window from this environment.
- **Browser Automation**: Agents **MUST** use Playwright for any task requiring a browser (navigating, scraping, taking screenshots).
    - **Do not** ask the user to open a browser.
    - **Do not** try to use the `open_browser` tool if it relies on a system GUI browser.
    - **Use** `playwright` MCP tools or scripts.

## Build & Run Commands
- **Dev Server**: `pnpm dev` (Runs on localhost:3000)
- **Build**: `pnpm build`
- **Panda CSS**: `pnpm panda:codegen` (Run this if styles are missing or not updating)
- **Lint**: `pnpm lint`

## Tools Deep Dive

### 1. Next Game (`/tools/next-game`)
Displays the upcoming hockey schedule and past game results.
- **Data Source**: `src/data/schedule.json` and `src/data/mhr-schedule.json`.
- **Sync Mechanism**:
    - Checks for stale data (> 1 hour).
    - Triggers API `/api/admin/sync-schedule`.
    - Scrapes MyHockeyRankings (MHR) using Puppeteer/Cheerio (see `scrape_mhr.js` / `scrape_puppeteer.js`).
- **Key Components**:
    - `NextGameClient.tsx`: Main UI. Handles "Next Game", "Next Home Game", and full schedule list.
    - `GameCard.tsx`: Displays individual game details (opponent, time, location).
- **Features**:
    - Highlights "Home" and "Local" games.
    - Links to YouTube channel.
    - Clickable past games (intended to link to MHR game previews).

### 2. Knee Rehab (`/tools/knee-rehab`)
*Simple tracking tool for knee rehabilitation exercises.*
- **Structure**: Likely a client-side form or list to track reps/sets.

### 3. Stat Recording (`/tools/stat-recording`)
*Tool for recording hockey player statistics.*
- **Usage**: Likely used during games to track shots, goals, assists, etc.

## Agent Guidelines
1.  **Styling**: Always use Panda CSS (`css({})`, `cx()`, `stack()`, etc.). Import from `@styled-system/css` or `@styled-system/patterns`.
2.  **Filesystem**: Always use absolute paths.
3.  **Refactoring**: When modifying components, ensure classnames are deterministic and readable.
4.  **Scraping**: If asked to scrape, check `scrape_puppeteer.js` for examples of how to run headless Chrome in this environment.
