# The Thirteenth Chime

*A murder mystery where the murderer learns from you.*

A 3D time-loop murder mystery set in a storm-bound Yorkshire country house. Every four minutes, Sir Edmund is poisoned before he can sign a confession exposing a twelve-year-old cover-up. The clock strikes thirteen and time rewinds. You remember every loop. So does the murderer.

Cambridge × Arcade AI Hackathon 2026 — Game Tech track.

## Play

Open `index.html` in a modern browser (Chrome, Edge, Firefox). No install, no build step. A tutorial runs before the game starts.

| Key | Action |
|---|---|
| W A S D / arrow keys | Walk |
| E | Talk / examine |
| J | Journal: evidence, timeline, accusation |
| H | Rules and tutorial |
| Esc | Close a panel |
| Mouse wheel | Zoom |

## The idea: a perception-limited adaptive antagonist

The murderer is a game-AI agent with a simple perception model and a memory that persists across loops.

- He learns only what he **sees** you do, based on line of sight within rooms.
- Investigate unseen, and he knows nothing.
- Get caught taking his vial or watching him at the drink table, and next loop he changes his plan: a new hiding place, a different route.

Your advantage comes from revealing less. Investigation becomes a stealth game against an opponent who adapts.

## How it works

- **Deterministic simulation.** Five characters follow timed schedules with room-to-room pathfinding. Every action is shown as a caption above the character.
- **Two kinds of state.** Persistent state (your evidence, a timeline of what you observed, the antagonist's memory) survives each loop. Physical state (positions, items, the drink, Edmund's life) resets.
- **Fair deduction.** An accusation needs a motive *and* proof of the act. Red herrings point at the other guests.
- **Two solution paths.** Observation (watch the poisoning unseen) or interception (take the vial and make him give himself away). Save Edmund, or arrive too late.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout, tutorial, panels |
| `game.js` | Game logic: schedules, loop, perception and memory, evidence, accusation |
| `render3d.js` | 3D scene (Three.js): house, characters, captions, camera |
| `style.css` | Interface styling |
| `lib/three.min.js` | Three.js r128 (MIT licence) |
