# Demon Roulette Improvement Backlog

This document is a practical roadmap of features and upgrades that would make the app feel more polished, more replayable, and more like a premium Geometry Dash challenge tool.

## Highest Impact Features

### 1. Daily / Weekly challenge mode
- Generate a fixed seeded challenge every day or week.
- Use a deterministic list subset and target progression.
- Create public challenge IDs like `DR-2026-09-26`.
- Add shareable links for the same challenge.
- Great for repeat play and community engagement.

### 2. Run statistics dashboard
- Total runs started
- Runs completed
- Average final percent
- Best streak
- Total hours played
- Best score / longest run
- Show recent history with timestamps

### 3. Seeded roulette / challenge codes
- Save exact challenge parameters and list selection.
- Let users share a run setup without exposing personal progress.
- Support challenge presets like `AREDL 1-250` or `Pointercrate top 100`.
- Useful for streamers and challenge communities.

### 4. Better level preview panel
- Show creator, list position, difficulty, and video thumbnail
- Add a button to open the level page externally
- Show the source list the level came from
- Add small visual tags like `Pointercrate`, `AREDL`, `Verified`, `Community`

### 5. Replay and history improvements
- Show complete run history with runs grouped by date
- Save run notes or custom labels
- Let users compare multiple runs side by side
- Add filters like `completed`, `failed`, `skipped`, `daily challenges`

## Game and UX Improvements

### 6. Better stopwatch and round timing
- Show total run timer at the top
- Show individual level timer in the challenge list
- Add a summary card for average level time
- Highlight fastest or slowest clears
- Store timer values in the save code and result summary

### 7. More clear level state indicators
- Show `current`, `success`, `failed`, `skipped`, `repeat` states visually
- Add a small badge for `repeat level` once the list cycle is exhausted
- Distinguish between actual failed attempts and skipped levels

### 8. Smarter validation feedback
- Add inline explanation when a percentage is invalid
- Show hints like `Need 7% to continue` or `You already beat this target`
- Highlight the input field when invalid
- Prevent accidental blank or broken entries

### 9. Better save/load flow
- Keep save code hidden behind a copy button, but make it easier to find
- Add `Load run` success / failure toast states
- Show a preview of the saved run before loading it
- Validate corrupted or outdated save codes clearly

### 10. Keyboard and accessibility improvements
- Keyboard navigation for all buttons and inputs
- Focus states for accessibility
- Better color contrast on all cards and status pills
- Ensure all tags and labels are screen-reader friendly

## Visual / Design Upgrades

### 11. More premium challenge board UI
- Compact but readable side history panel
- Better spacing between rows
- Clear separation between active round and finished rounds
- Slight hover transitions and micro-animations
- Better colors for success, skip, fail, and repeat states

### 12. More polished status badges
- `Source`, `Target`, `Skip count`, `Run status`, `Timer`
- Use subtle background colors rather than plain text labels
- Make it easier to scan at a glance

### 13. Stronger success/fail feedback
- Small success flash when a level is cleared
- Failure flash or red pulse when you fail a target
- Confetti or celebratory effect on full completion
- Smooth transitions between rounds

### 14. Better mobile responsiveness
- Touch-friendly buttons and inputs
- Sticky action bar at the bottom on mobile
- Responsive challenge panel stacking behavior
- Simplified layout for narrow screens

## Data and Source Improvements

### 15. Add more source selection flexibility
- Pointercrate current demon list
- AREDL selected range
- Community lists
- Custom curated challenge packs
- Optional difficulty filters

### 16. Deduplicate and normalize level metadata
- Standardize creator names where possible
- Map weird AREDL data fields to a single creator format
- Handle missing thumbnails and fallbacks gracefully
- Keep level IDs consistent across sources

### 17. Better list range management
- Allow custom preset ranges such as `1-50`, `50-150`, `Top 100`, `100-500`
- Show total levels in the selected range
- Show how many levels remain unused in the current challenge
- Warn if the range is too small for a long roulette run

## Social / Community Features

### 18. Shareable challenge summaries
- Show a run summary card that users can copy/share
- Add a `Copy summary` button
- Include target progress, level count, and final time
- Great for Discord / YouTube / Twitch use

### 19. Leaderboard concept
- Local leaderboard for saved runs on the same browser
- Optional cloud leaderboard later
- Show best final percentage, fewest skips, fastest clear time
- Add filters by challenge source and range size

### 20. Community challenge presets
- Community-created challenge packs
- Example: `Top 50 only`, `AREDL 500-1000`, `No repeats`, `Daily hard mode`
- Let creators share challenge code and seed information

## Long-Term / Big Upgrade Ideas

### 21. Account system
- Save runs across devices
- Track personal challenge stats
- Link to Discord or Google login
- Unlock achievements and badges

### 22. Global challenge server
- Store run history in a backend
- Ranked challenge records
- Public daily challenge results
- Community vote on upcoming challenge sets

### 23. Advanced challenge generation
- Weighted selection by creator, source, or difficulty
- Filter out already-done creators
- Add challenge presets for different play styles
- Optional `Hard`, `Normal`, `Casual` modes

### 24. Video / GD link integration
- Auto-open official level pages
- Add YouTube preview links where available
- Show `creator`, `video`, and `verification` info more nicely

## Nice-to-Have Extras

### 25. Sound and feedback polish
- Success chime
- Fail jingle
- Copy confirmation sound
- Soft background ambience toggle

### 26. Theme options
- Dark mode default
- Alternate neon theme
- High-contrast accessibility theme
- More custom accent colors

### 27. More challenge metadata
- Number of unique levels used
- Percent of list completed in the run
- Current cycle count after repeats begin
- Special notes on “forced repeat before list reset” logic

### 28. Local data management
- Export settings and runs
- Import saved runs from a file
- Clear run history confirmation
- Backup and restore tool

## Recommended Next 5 Features

If you want the biggest value in the next version, do these first:

1. Daily / weekly seeded challenge mode
2. Better run stats dashboard
3. Shareable challenge summaries
4. Improved level preview metadata
5. Premium challenge board UI polish

## Suggested Priorities

### Priority 1: Must Have
- Daily challenge mode
- Better stats tracking
- More reliable metadata hydration
- Stable timer display in run summary

### Priority 2: Strong Improvement
- Start / end total run timer
- Shareable run cards
- Better save/load UX
- Improved challenge board design

### Priority 3: Nice to Have
- Accounts
- Global leaderboards
- Audio effects
- Advanced challenge packs

## Final Recommendation

The app already has the core structure right. The next major leap is not adding random features — it is making the app feel like a complete challenge game with:
- replayability
- stats
- sharing
- polished presentation
- reliable metadata and timer tracking

That is the biggest opportunity for making it feel premium rather than just functional.
