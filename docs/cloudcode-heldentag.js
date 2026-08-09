// WeRace jury editor — cloud functions
// Include from main.js with: require('./werace');
// Remove by deleting that line and this file.

Parse.Cloud.define('refereeUpdate', async (request) => {
    const { action, refereeToken, objectId, status, qualiClosed, startGroupObjectId, fields } = request.params;

    const event = await new Parse.Query('HT_EVENT').get(
        request.params.eventObjectId ?? await getEventObjectId(),
        { useMasterKey: true }
    );
    if (event.get('refereeToken') && event.get('refereeToken') !== refereeToken) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Invalid referee token');
    }

    if (action === 'setStarterStatus') {
        const obj = await new Parse.Query('HT_STARTER').get(objectId, { useMasterKey: true });
        obj.set('status', status);
        await obj.save(null, { useMasterKey: true });
        return { ok: true };
    }

    if (action === 'setQualiClosed') {
        const obj = await new Parse.Query('HT_STARTGROUP').get(objectId, { useMasterKey: true });
        obj.set('qualiClosed', qualiClosed);
        await obj.save(null, { useMasterKey: true });
        return { ok: true };
    }

    if (action === 'updateEventSettings') {
        const allowed = ['qualiRuns', 'finalRuns', 'bestOf', 'qualiScoreMode', 'finalScoreMode', 'presenceStalMs', 'presencePollMs', 'criteria'];
        for (const key of allowed) {
            if (fields[key] !== undefined) event.set(key, fields[key]);
        }
        await event.save(null, { useMasterKey: true });
        return { ok: true };
    }

    if (action === 'createFinal') {
        return await createFinal(event, startGroupObjectId);
    }

    if (action === 'clearActiveStarter') {
        const query = new Parse.Query('HT_ACTIVESTARTER');
        query.equalTo('event', event);
        const existing = await query.first({ useMasterKey: true });
        if (existing) {
            existing.set('startNumber', null);
            await existing.save(null, { useMasterKey: true });
        }
        return { ok: true };
    }

    if (action === 'publishActiveStarter') {
        const { startNumber, runNumber, phase } = request.params;
        const query = new Parse.Query('HT_ACTIVESTARTER');
        query.equalTo('event', event);
        const existing = await query.first({ useMasterKey: true });
        const payload = { startNumber, runNumber: Number(runNumber) || 1, phase: phase ?? 'quali' };
        if (existing) {
            for (const [k, v] of Object.entries(payload)) existing.set(k, v);
            await existing.save(null, { useMasterKey: true });
        } else {
            const Active = Parse.Object.extend('HT_ACTIVESTARTER');
            const obj = new Active();
            for (const [k, v] of Object.entries(payload)) obj.set(k, v);
            obj.set('event', event);
            await obj.save(null, { useMasterKey: true });
        }
        return { ok: true };
    }

    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Unknown action');
});

// Compute final start order for a startgroup and persist as FinalEntry records.
// Best qualifier gets the highest final start number (starts last).
async function createFinal(event, startGroupObjectId) {
    const startGroup = await new Parse.Query('HT_STARTGROUP').get(startGroupObjectId, { useMasterKey: true });

    // Idempotency guard — if a concurrent call already created entries, return early
    const guardQuery = new Parse.Query('HT_FINALENTRY');
    guardQuery.equalTo('event', event);
    guardQuery.equalTo('startGroup', startGroup);
    guardQuery.limit(1);
    const guardCount = await guardQuery.count({ useMasterKey: true });
    if (guardCount > 0) {
        return { created: guardCount, idempotent: true };
    }

    const bestOf = event.get('bestOf') ?? 8;
    const qualiRuns = event.get('qualiRuns') ?? null;
    const qualiScoreMode = event.get('qualiScoreMode') ?? 'sum';
    const criteria = (event.get('criteria') ?? []).map((c, i, arr) => ({
        ...c, weight: c.weight ?? Math.round(100 / arr.length),
    }));

    function calcJudgeTotal(s) {
        return Math.round(criteria.reduce((a, c) =>
            a + (s.get(c.key) ?? 0) * (c.weight / 100), 0));
    }

    function deduplicateByJudge(scoreList) {
        const latest = new Map();
        for (const s of scoreList) latest.set(s.get('judgeName'), s);
        return [...latest.values()];
    }

    const startersQuery = new Parse.Query('HT_STARTER');
    startersQuery.equalTo('startGroup', startGroup);
    startersQuery.notEqualTo('status', 'disqualified');
    startersQuery.notEqualTo('status', 'removed');
    startersQuery.limit(500);
    const starters = await startersQuery.find({ useMasterKey: true });

    // Load all jury scores for the event
    const scoresQuery = new Parse.Query('HT_JURYSCORE');
    scoresQuery.equalTo('event', event);
    scoresQuery.equalTo('phase', 'quali');
    scoresQuery.limit(5000);
    scoresQuery.ascending('createdAt');
    const scores = await scoresQuery.find({ useMasterKey: true });

    // Group scores by startnumber, then split into runs using runNumber field
    // (fallback: judge-repeat boundary detection for old records without runNumber)
    const byStartNumber = {};
    for (const s of scores) {
        const n = s.get('startNumber');
        if (!byStartNumber[n]) byStartNumber[n] = [];
        byStartNumber[n].push(s);
    }

    function scoreToRuns(scoreList) {
        const hasRunNumber = scoreList.some(s => s.get('runNumber') != null);
        if (hasRunNumber) {
            const byRun = {};
            for (const s of scoreList) {
                const r = s.get('runNumber') ?? 1;
                if (!byRun[r]) byRun[r] = [];
                byRun[r].push(s);
            }
            return Object.keys(byRun).map(Number).sort((a, b) => a - b)
                .map(r => {
                    const deduped = deduplicateByJudge(byRun[r]);
                    return deduped.reduce((a, s) => a + calcJudgeTotal(s), 0);
                });
        }
        // Fallback: detect run boundary when a judge name repeats
        const runs = [];
        let chunk = [];
        const seen = new Set();
        for (const s of scoreList) {
            const name = s.get('judgeName');
            if (seen.has(name)) {
                if (chunk.length) {
                    const deduped = deduplicateByJudge(chunk);
                    runs.push(deduped.reduce((a, s) => a + calcJudgeTotal(s), 0));
                }
                chunk = [s]; seen.clear(); seen.add(name);
            } else {
                chunk.push(s); seen.add(name);
            }
        }
        if (chunk.length) {
            const deduped = deduplicateByJudge(chunk);
            runs.push(deduped.reduce((a, s) => a + calcJudgeTotal(s), 0));
        }
        return runs;
    }

    // Map startNumber → sum of all quali runs
    const startNumberToStarter = new Map(starters.map(s => [String(s.get('startNumber')), s]));
    const ranked = [];
    for (const [numStr, scoreList] of Object.entries(byStartNumber)) {
        const starter = startNumberToStarter.get(numStr);
        if (!starter) continue;
        const allRunTotals = scoreToRuns(scoreList);
        const qualiRunTotals = qualiRuns != null ? allRunTotals.slice(0, qualiRuns) : allRunTotals;
        const qualiScore = qualiScoreMode === 'best'
            ? (qualiRunTotals.length ? Math.max(...qualiRunTotals) : 0)
            : qualiRunTotals.reduce((a, b) => a + b, 0);
        ranked.push({ starter, qualiScore });
    }

    // Sort descending by qualiScore, take top bestOf
    ranked.sort((a, b) => b.qualiScore - a.qualiScore);
    const finalists = ranked.slice(0, bestOf);

    // Delete existing FinalEntry records for this group
    const existingQuery = new Parse.Query('HT_FINALENTRY');
    existingQuery.equalTo('startGroup', startGroup);
    existingQuery.equalTo('event', event);
    existingQuery.limit(500);
    const existing = await existingQuery.find({ useMasterKey: true });
    await Parse.Object.destroyAll(existing, { useMasterKey: true });

    // Create new FinalEntry records:
    // Best qualifier (index 0) gets finalStartNumber = 1
    const FinalEntry = Parse.Object.extend('HT_FINALENTRY');
    const entries = finalists.map(({ starter, qualiScore }, i) => {
        const e = new FinalEntry();
        e.set('event', event);
        e.set('startGroup', startGroup);
        e.set('starter', starter);
        e.set('startNumber', starter.get('startNumber'));
        e.set('qualiScore', qualiScore);
        e.set('finalStartNumber', String(i + 1)); // best qualifier = '1'
        return e;
    });
    await Parse.Object.saveAll(entries, { useMasterKey: true });

    return { created: entries.length };
}

// Cascade-delete all data belonging to a starter when it is removed.
Parse.Cloud.beforeDelete('HT_STARTER', async (request) => {
    const starter = request.object;
    const startNumber = String(starter.get('startNumber'));

    await Promise.all([
        // HT_JURYSCORE — matched by startnumber (String) scoped to same event
        (async () => {
            const q = new Parse.Query('HT_JURYSCORE');
            q.equalTo('startNumber', startNumber);
            q.limit(5000);
            const results = await q.find({ useMasterKey: true });
            await Parse.Object.destroyAll(results, { useMasterKey: true });
        })(),

        // HT_FINALENTRY — matched by Pointer to starter
        (async () => {
            const q = new Parse.Query('HT_FINALENTRY');
            q.equalTo('starter', starter);
            q.limit(500);
            const results = await q.find({ useMasterKey: true });
            await Parse.Object.destroyAll(results, { useMasterKey: true });
        })(),

        // HT_ACTIVESTARTER — clear startNumber if this starter is currently active
        (async () => {
            const q = new Parse.Query('HT_ACTIVESTARTER');
            q.equalTo('startNumber', starter.get('startNumber'));
            q.limit(10);
            const results = await q.find({ useMasterKey: true });
            for (const obj of results) {
                obj.set('startNumber', null);
            }
            await Parse.Object.saveAll(results, { useMasterKey: true });
        })(),
    ]);
});

async function getEventObjectId() {
    const results = await new Parse.Query('HT_EVENT').limit(1).find({ useMasterKey: true });
    if (!results.length) throw new Error('No event found');
    return results[0].id;
}
