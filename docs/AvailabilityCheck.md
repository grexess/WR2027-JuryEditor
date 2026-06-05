# Availability Check – Judge Presence in starter.html

`starter.html` blocks the starter picker until every configured judge is online. This prevents the announcer from sending a rider onto the floor when scoring would be incomplete.

## How it works

### 1. Presence data (Parse `JuryPresence` class)

Each judge's browser writes a heartbeat to the `JuryPresence` Parse class while the judge is active. Each record contains:

| Field | Type | Description |
|---|---|---|
| `judgeName` | String | Display name from `config.js → judgeTokens` |
| `lastSeen` | Date | Timestamp of the most recent heartbeat |

A record is considered **online** if its `lastSeen` timestamp is no older than **35 seconds** (`PRESENCE_STALE_MS` in `parse-api.js`).

### 2. Fetching presence (`ParseAPI.fetchPresence`)

`fetchPresence()` queries all `JuryPresence` records and filters out stale ones client-side:

```js
const cutoff = Date.now() - PRESENCE_STALE_MS;   // 35 s ago
return results.filter(r => new Date(r.lastSeen.iso).getTime() > cutoff);
```

### 3. Polling and live updates (`starter.html`)

`starter.html` keeps its `onlineJudges` set current via two mechanisms:

| Mechanism | How | Interval |
|---|---|---|
| Polling | `setInterval(refreshPresence, 15000)` | every 15 s |
| Live push | `ParseAPI.subscribePresence(refreshPresence)` | immediate on any `JuryPresence` create / update / delete |

`refreshPresence()` calls `ParseAPI.fetchPresence()`, rebuilds `onlineJudges`, and then calls `renderPresenceChips()`.

### 4. Gate logic (`renderPresenceChips`)

```js
const allOnline = JUDGE_NAMES.every(n => onlineJudges.has(n));

document.getElementById('presence-overlay').classList.toggle('hidden', allOnline);
document.getElementById('picker-section').style.display = allOnline ? '' : 'none';
```

`JUDGE_NAMES` is derived from `Object.values(CONFIG.judgeTokens)` — i.e. every judge listed in `config.js` must be present. If even one judge is missing the overlay replaces the picker and the announcer cannot proceed.

The gate is bypassed while a starter is already on the floor (`activeStarter !== null`): presence changes do not hide the waiting screen mid-run.

### 5. Visual feedback

**Header chips** — one chip per judge is always visible in the header.

- Green dot → judge is in `onlineJudges` (heartbeat received within 35 s)
- Spinning ring → judge not yet seen or heartbeat expired

**Presence overlay** — shown in place of the picker whenever `allOnline` is `false`, displaying "Warte auf Kampfrichter".

The chips re-render every second via an internal `setInterval` so the spinner animations and stale-detection stay responsive even between poll cycles.

## Where to change the intervals

Both tunable intervals are in `config.js`:

| Key | Default | Effect of increasing |
|---|---|---|
| `presenceStalMs` | `70000` ms | Judges stay "online" longer after their last heartbeat |
| `presencePollMs` | `30000` ms | Less frequent REST fallback; relies more on Live Query |

The chip re-render ticker (`1000` ms, `starter.html`) is intentionally not configurable — it only drives spinner animations and does not cause network traffic.

`presenceStalMs` and the heartbeat interval on the judge side must stay in sync: the threshold should be at least 2× the heartbeat interval so a single missed beat does not drop a judge offline.

## Configuration

The set of required judges is defined entirely in `config.js`:

```js
judgeTokens: {
    'WR27-J1-ALICE': 'Alice',
    'WR27-J2-BOB':   'Bob',
    'WR27-J3-CAROL': 'Carol',
},
```

Adding or removing a token immediately changes how many judges must be online before the picker becomes available. No code changes are needed.

## Sequence overview

```
Judge browser           Parse (JuryPresence)       starter.html
     │                         │                        │
     │── heartbeat() ─────────>│                        │
     │                         │<── subscribePresence ──│
     │                         │──── onChange() ───────>│
     │                         │                        │── refreshPresence()
     │                         │<── fetchPresence() ────│
     │                         │──── records ──────────>│
     │                         │                        │── renderPresenceChips()
     │                         │                        │   allOnline? show picker : show overlay
```
