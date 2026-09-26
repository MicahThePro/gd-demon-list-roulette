# Demon Roulette Website - Complete Technical Specification

## Overview
A web application that imports a Geometry Dash demon list and runs a percentage roulette challenge.

### User Flow
1. User pastes a demon list URL.
2. App fetches all levels from the list.
3. User chooses a starting percentage.
4. App randomly selects a level.
5. User attempts the level and submits their achieved percentage.
6. If achieved percentage >= target percentage, target increases by 1.
7. A new random level is chosen.
8. Repeat until 100% is reached or the user gives up.
9. Display results page.

## Supported Lists
- Pointercrate Demon List
- Shitty Demon List
- Future custom lists

## Recommended Stack
### Frontend
- React
- TypeScript
- Tailwind CSS
- Vite

### Backend
- Node.js
- Express

### Database
- PostgreSQL or SQLite

## Data Models
```ts
interface Level {
  id: string;
  name: string;
  position: number;
  creator?: string;
  video?: string;
}
```

```ts
interface RouletteRound {
  roundNumber: number;
  targetPercent: number;
  achievedPercent: number;
  result: 'success' | 'failure';
  level: Level;
}
```

```ts
interface RouletteRun {
  currentTarget: number;
  startingPercent: number;
  status: 'active' | 'failed' | 'completed';
  rounds: RouletteRound[];
}
```

## Pages
### Home
Inputs:
- Demon list URL
- Starting percentage
- Allow duplicates toggle
- Start button

### Roulette Screen
Display:
- Current target percent
- Current round
- Level name
- Position on list

Actions:
- Success
- Give Up

### Results Page
Display:
- Final percentage
- Total rounds
- Complete history
- Share button

## API Design
### Import List Endpoint
```http
POST /api/import
```

Request:
```json
{
  "url": "https://pointercrate.com/demonlist/"
}
```

Response:
```json
{
  "source": "pointercrate",
  "count": 150,
  "levels": []
}
```

## Roulette Logic
### Success
```ts
if (achievedPercent >= targetPercent) {
  targetPercent++;
}
```

### Failure
```ts
endRun();
```

### Completion
```ts
if (targetPercent > 100) {
  completeRun();
}
```

## Local Storage
```ts
localStorage.setItem('run', JSON.stringify(run));
```

## Database Tables
### Runs
```sql
CREATE TABLE runs (
 id SERIAL PRIMARY KEY,
 starting_percent INT,
 ending_percent INT,
 completed BOOLEAN
);
```

### Run Rounds
```sql
CREATE TABLE run_rounds (
 id SERIAL PRIMARY KEY,
 run_id INT,
 level_name TEXT,
 target_percent INT,
 achieved_percent INT,
 success BOOLEAN
);
```

## Folder Structure
```text
src/
  components/
  hooks/
  pages/
  services/
  types/
  utils/
```

## MVP Features
- Import list
- Random level selection
- Percentage progression
- Run history
- Results page
- Local save

## Future Features
- Accounts
- Global leaderboard
- Shareable runs
- Seeded roulettes
- Video previews
- Mobile support
