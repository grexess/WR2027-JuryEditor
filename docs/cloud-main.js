// Paste this into Back4App Cloud Code → main.js

Parse.Cloud.define('refereeUpdate', async (request) => {
    const { action, refereeToken, objectId, status, qualiClosed, startGroupObjectId } = request.params;

    const event = await new Parse.Query('Event').get(
        request.params.eventObjectId ?? await getEventObjectId(),
        { useMasterKey: true }
    );
    if (!event || event.get('refereeToken') !== refereeToken) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Invalid referee token');
    }

    if (action === 'setStarterStatus') {
        const obj = await new Parse.Query('Starter').get(objectId, { useMasterKey: true });
        obj.set('status', status);
        await obj.save(null, { useMasterKey: true });
        return { ok: true };
    }

    if (action === 'setQualiClosed') {
        const obj = await new Parse.Query('StartGroup').get(objectId, { useMasterKey: true });
        obj.set('qualiClosed', qualiClosed);
        await obj.save(null, { useMasterKey: true });
        return { ok: true };
    }

    if (action === 'createFinal') {
        return await createFinal(event, startGroupObjectId);
    }

    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Unknown action');
});

// Compute final start order for a startgroup and persist as FinalEntry records.
// Best qualifier gets the highest final start number (starts last).
async function createFinal(event, startGroupObjectId) {
    const bestOf = event.get('bestOf') ?? 8;
    const judgeCount = (await new Parse.Query('Judge')
        .equalTo('event', event)
        .count({ useMasterKey: true })) || 1;

    // Load all starters in this group that are active
    const startGroup = await new Parse.Query('StartGroup').get(startGroupObjectId, { useMasterKey: true });
    const startersQuery = new Parse.Query('Starter');
    startersQuery.equalTo('startGroup', startGroup);
    startersQuery.notEqualTo('status', 'disqualified');
    startersQuery.notEqualTo('status', 'removed');
    startersQuery.limit(500);
    const starters = await startersQuery.find({ useMasterKey: true });
    const starterIds = new Set(starters.map(s => s.id));
    const startNumbers = new Map(starters.map(s => [s.id, s.get('startNumber')]));

    // Load all jury scores for the event
    const scoresQuery = new Parse.Query('JuryScore');
    scoresQuery.equalTo('event', event);
    scoresQuery.limit(5000);
    scoresQuery.ascending('createdAt');
    const scores = await scoresQuery.find({ useMasterKey: true });

    // Group scores by startnumber, chunk into runs, pick best run total
    const byStartNumber = {};
    for (const s of scores) {
        const n = s.get('startnumber');
        if (!byStartNumber[n]) byStartNumber[n] = [];
        byStartNumber[n].push(s.get('total') ?? 0);
    }

    // Map startNumber → best run total
    const startNumberToStarter = new Map(starters.map(s => [s.get('startNumber'), s]));
    const ranked = [];
    for (const [numStr, totals] of Object.entries(byStartNumber)) {
        const num = Number(numStr);
        const starter = startNumberToStarter.get(num);
        if (!starter) continue;
        // Chunk into runs of judgeCount and pick best
        let best = 0;
        for (let i = 0; i + judgeCount <= totals.length; i += judgeCount) {
            const runSum = totals.slice(i, i + judgeCount).reduce((a, b) => a + b, 0);
            if (runSum > best) best = runSum;
        }
        ranked.push({ starter, best });
    }

    // Sort descending by best score, take top bestOf
    ranked.sort((a, b) => b.best - a.best);
    const finalists = ranked.slice(0, bestOf);

    // Delete existing FinalEntry records for this group
    const existingQuery = new Parse.Query('FinalEntry');
    existingQuery.equalTo('startGroup', startGroup);
    existingQuery.equalTo('event', event);
    existingQuery.limit(500);
    const existing = await existingQuery.find({ useMasterKey: true });
    await Parse.Object.destroyAll(existing, { useMasterKey: true });

    // Create new FinalEntry records:
    // Best qualifier (index 0) gets finalStartNumber = finalists.length (starts last)
    const FinalEntry = Parse.Object.extend('FinalEntry');
    const entries = finalists.map(({ starter, best }, i) => {
        const e = new FinalEntry();
        e.set('event', event);
        e.set('startGroup', startGroup);
        e.set('starter', starter);
        e.set('startNumber', starter.get('startNumber'));
        e.set('qualiScore', best);
        e.set('finalStartNumber', finalists.length - i); // best = highest = starts last
        return e;
    });
    await Parse.Object.saveAll(entries, { useMasterKey: true });

    return { created: entries.length };
}

async function getEventObjectId() {
    const results = await new Parse.Query('Event').limit(1).find({ useMasterKey: true });
    if (!results.length) throw new Error('No event found');
    return results[0].id;
}
