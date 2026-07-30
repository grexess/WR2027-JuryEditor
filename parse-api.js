const ParseAPI = (() => {
    const SESSION_KEY = 'werace-session';
    let _sessionToken = localStorage.getItem(SESSION_KEY) ?? null;
    let _sessionUser  = localStorage.getItem(SESSION_KEY + '-user') ?? null;

    function readHeaders() {
        const h = {
            'x-parse-application-id': CONFIG.parseAppId,
            'x-parse-javascript-key': CONFIG.parseJsKey,
            'content-type': 'application/json',
        };
        if (_sessionToken) h['x-parse-session-token'] = _sessionToken;
        return h;
    }

    function writeHeaders() {
        return readHeaders();
    }

    function getSessionUser() { return _sessionUser; }

    async function login(username, password) {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            { method: 'GET', headers: readHeaders() }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
        _sessionToken = data.sessionToken;
        _sessionUser  = data.username ?? username;
        localStorage.setItem(SESSION_KEY, _sessionToken);
        localStorage.setItem(SESSION_KEY + '-user', _sessionUser);
        return data;
    }

    async function logout() {
        try {
            await fetch(`${CONFIG.parseServerUrl}/logout`, { method: 'POST', headers: writeHeaders() });
        } catch (_) {}
        _sessionToken = null;
        _sessionUser  = null;
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY + '-user');
    }

    async function fetchAllEvents() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_EVENT?limit=100&order=name&keys=objectId,name,qualiRuns`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function fetchEvent() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_EVENT/${CONFIG.eventObjectId}`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const ev = await res.json();
        if (ev.name)          CONFIG.eventName     = ev.name;
        if (ev.criteria)      CONFIG.criteria      = ev.criteria;
        if (ev.presenceStalMs) CONFIG.presenceStalMs = ev.presenceStalMs;
        if (ev.presencePollMs) CONFIG.presencePollMs = ev.presencePollMs;
        if (ev.qualiRuns != null)   CONFIG.qualiRuns     = ev.qualiRuns;
        if (ev.finalRuns != null)   CONFIG.finalRuns     = ev.finalRuns;
        if (ev.bestOf    != null)   CONFIG.bestOf        = ev.bestOf;
        if (ev.refereeToken)        CONFIG.refereeToken  = ev.refereeToken;
        if (ev.qualiScoreMode)      CONFIG.qualiScoreMode = ev.qualiScoreMode;
        if (ev.finalScoreMode)      CONFIG.finalScoreMode = ev.finalScoreMode;
        return ev;
    }

    async function fetchJudges() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JUDGE?where=${where}&limit=100`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        const judges = data.results ?? [];
        CONFIG.judgeTokens = Object.fromEntries(judges.map(j => [j.token, j.name]));
        return judges;
    }

    async function fetchStarters() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_STARTER?limit=500&order=startNumber&include=startGroup`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function saveStarter(fields, objectId = null) {
        const url    = objectId
            ? `${CONFIG.parseServerUrl}/classes/HT_STARTER/${objectId}`
            : `${CONFIG.parseServerUrl}/classes/HT_STARTER`;
        const method = objectId ? 'PUT' : 'POST';
        const res    = await fetch(url, { method, headers: writeHeaders(), body: JSON.stringify(fields) });
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        return res.json();
    }

    async function deleteStarter(objectId) {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_STARTER/${objectId}`,
            { method: 'DELETE', headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
    }

    async function saveJuryScore(startnumber, judgeName, scores, criteria, runNumber, phase) {
        const total = criteria.reduce((a, c) => a + scores[c], 0);
        const body  = { startnumber: Number(startnumber), judgeName, total,
            runNumber: Number(runNumber) ?? 1, phase: phase ?? 'quali',
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId } };
        for (const c of CONFIG.criteria) body[c.key] = scores[c.label];
        const res = await fetch(`${CONFIG.parseServerUrl}/classes/HT_JURYSCORE`, {
            method: 'POST',
            headers: writeHeaders(),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        return res.json();
    }

    async function fetchScoreCountByStarter() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
            phase: 'quali',
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYSCORE?where=${where}&limit=2000&keys=startnumber,runNumber`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        // Count distinct runNumbers per starter
        const byStarter = {};
        for (const s of data.results ?? []) {
            if (!byStarter[s.startnumber]) byStarter[s.startnumber] = new Set();
            byStarter[s.startnumber].add(s.runNumber ?? 1);
        }
        const map = {};
        for (const [num, set] of Object.entries(byStarter)) map[num] = set.size;
        return map;
    }

    async function fetchFinalScoreCountByStarter() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
            phase: 'final',
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYSCORE?where=${where}&limit=1000&keys=startnumber,runNumber`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        // Count distinct runNumbers per starter (each runNumber = one complete run)
        const byStarter = {};
        for (const s of data.results ?? []) {
            if (!byStarter[s.startnumber]) byStarter[s.startnumber] = new Set();
            byStarter[s.startnumber].add(s.runNumber ?? 1);
        }
        const map = {};
        for (const [num, set] of Object.entries(byStarter)) map[num] = set.size;
        return map;
    }

    async function deleteQualiRun(startnumber, runNumber) {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
            startnumber: Number(startnumber),
            phase: 'quali',
            runNumber: Number(runNumber),
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYSCORE?where=${where}&limit=100&keys=objectId`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const { results } = await res.json();
        for (const obj of results ?? []) {
            const del = await fetch(`${CONFIG.parseServerUrl}/classes/HT_JURYSCORE/${obj.objectId}`,
                { method: 'DELETE', headers: readHeaders() });
            if (!del.ok) throw new Error(`Delete failed ${del.status}`);
        }
        return results?.length ?? 0;
    }

    async function fetchJuryScores(startnumber) {
        const where = JSON.stringify({
            startnumber: Number(startnumber),
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
        });
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYSCORE?where=${encodeURIComponent(where)}`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    function subscribeJuryScores(startnumber, onScore) {
        const ws = new WebSocket(CONFIG.parseLiveQueryUrl);
        let requestId = 2;

        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                op: 'connect',
                applicationId: CONFIG.parseAppId,
                javascriptKey:  CONFIG.parseJsKey,
            }));
        });

        ws.addEventListener('message', e => {
            const msg = JSON.parse(e.data);
            if (msg.op === 'connected') {
                ws.send(JSON.stringify({
                    op:        'subscribe',
                    requestId,
                    query: {
                        className: 'HT_JURYSCORE',
                        where: {
                            startnumber: Number(startnumber),
                            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
                        },
                    },
                }));
            }
            if (msg.op === 'create' && msg.object) {
                onScore(msg.object);
            }
        });

        return ws;
    }

    // ── Live Query ──

    async function publishActiveStarter(startNumber, runNumber, phase) {
        const existing = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_ACTIVESTARTER?where=${encodeURIComponent(JSON.stringify({ event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId } }))}`,
            { headers: readHeaders() }
        );
        if (!existing.ok) throw new Error(`Parse error ${existing.status}`);
        const { results } = await existing.json();

        const payload = { startNumber, runNumber: Number(runNumber) ?? 1, phase: phase ?? 'quali' };
        if (results?.length) {
            const res = await fetch(
                `${CONFIG.parseServerUrl}/classes/HT_ACTIVESTARTER/${results[0].objectId}`,
                { method: 'PUT', headers: writeHeaders(), body: JSON.stringify(payload) }
            );
            if (!res.ok) throw new Error(`Parse error ${res.status}`);
        } else {
            const res = await fetch(
                `${CONFIG.parseServerUrl}/classes/HT_ACTIVESTARTER`,
                {
                    method: 'POST',
                    headers: writeHeaders(),
                    body: JSON.stringify({
                        ...payload,
                        event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
                    }),
                }
            );
            if (!res.ok) throw new Error(`Parse error ${res.status}`);
        }
    }

    function subscribeActiveStarter(onStartNumber) {
        const ws = new WebSocket(CONFIG.parseLiveQueryUrl);
        let requestId = 1;

        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                op: 'connect',
                applicationId: CONFIG.parseAppId,
                javascriptKey:  CONFIG.parseJsKey,
            }));
        });

        ws.addEventListener('message', e => {
            const msg = JSON.parse(e.data);
            if (msg.op === 'connected') {
                ws.send(JSON.stringify({
                    op:        'subscribe',
                    requestId,
                    query: {
                        className: 'HT_ACTIVESTARTER',
                        where: {
                            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
                        },
                    },
                }));
            }
            if ((msg.op === 'create' || msg.op === 'update') && msg.object?.startNumber != null) {
                onStartNumber(msg.object.startNumber, msg.object.runNumber ?? 1, msg.object.phase ?? 'quali');
            }
        });

        ws.addEventListener('close', () => {
            // Reconnect after 3 s if the socket drops
            setTimeout(() => subscribeActiveStarter(onStartNumber), 3000);
        });

        return ws;
    }

    // ── Presence ──

    const PRESENCE_STALE_MS = CONFIG.presenceStalMs;

    async function heartbeat(judgeName) {
        const eventPtr = { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId };
        const where = JSON.stringify({ judgeName, event: eventPtr });
        const existing = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYPRESENCE?where=${encodeURIComponent(where)}&limit=1`,
            { headers: readHeaders() }
        );
        const { results } = await existing.json();
        const body = { lastSeen: { __type: 'Date', iso: new Date().toISOString() } };

        if (results?.length) {
            await fetch(`${CONFIG.parseServerUrl}/classes/HT_JURYPRESENCE/${results[0].objectId}`,
                { method: 'PUT', headers: writeHeaders(), body: JSON.stringify(body) });
        } else {
            await fetch(`${CONFIG.parseServerUrl}/classes/HT_JURYPRESENCE`,
                { method: 'POST', headers: writeHeaders(), body: JSON.stringify({ ...body, judgeName, event: eventPtr }) });
        }
    }

    async function removePresence(judgeName) {
        const eventPtr = { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId };
        const where = JSON.stringify({ judgeName, event: eventPtr });
        const existing = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYPRESENCE?where=${encodeURIComponent(where)}&limit=1`,
            { headers: readHeaders() }
        );
        const { results } = await existing.json();
        if (results?.length) {
            await fetch(`${CONFIG.parseServerUrl}/classes/HT_JURYPRESENCE/${results[0].objectId}`,
                { method: 'DELETE', headers: readHeaders() });
        }
    }

    async function fetchPresence() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYPRESENCE?where=${where}`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        const cutoff = Date.now() - PRESENCE_STALE_MS;
        return (data.results ?? []).filter(r => new Date(r.lastSeen?.iso ?? r.lastSeen).getTime() > cutoff);
    }

    function subscribePresence(onChange) {
        const ws = new WebSocket(CONFIG.parseLiveQueryUrl);

        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                op: 'connect',
                applicationId: CONFIG.parseAppId,
                javascriptKey: CONFIG.parseJsKey,
            }));
        });

        ws.addEventListener('message', e => {
            const msg = JSON.parse(e.data);
            if (msg.op === 'connected') {
                ws.send(JSON.stringify({
                    op: 'subscribe',
                    requestId: 3,
                    query: {
                        className: 'HT_JURYPRESENCE',
                        where: { event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId } },
                    },
                }));
            }
            if (['create', 'update', 'delete', 'leave'].includes(msg.op)) onChange();
        });

        ws.addEventListener('close', () => setTimeout(() => subscribePresence(onChange), 3000));

        return ws;
    }

    async function fetchAllJuryScores() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYSCORE?where=${where}&limit=2000&order=createdAt`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    function subscribeAllJuryScores(onChange) {
        const ws = new WebSocket(CONFIG.parseLiveQueryUrl);
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({
                op: 'connect',
                applicationId: CONFIG.parseAppId,
                javascriptKey: CONFIG.parseJsKey,
            }));
        });
        ws.addEventListener('message', e => {
            const msg = JSON.parse(e.data);
            if (msg.op === 'connected') {
                ws.send(JSON.stringify({
                    op: 'subscribe',
                    requestId: 10,
                    query: {
                        className: 'HT_JURYSCORE',
                        where: { event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId } },
                    },
                }));
            }
            if (msg.op === 'create') onChange();
        });
        ws.addEventListener('close', () => setTimeout(() => subscribeAllJuryScores(onChange), 3000));
        return ws;
    }

    async function refereeUpdate(params) {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/functions/refereeUpdate`,
            {
                method: 'POST',
                headers: readHeaders(),
                body: JSON.stringify({ ...params, refereeToken: CONFIG.refereeToken }),
            }
        );
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? `Parse error ${res.status}`);
        return data.result;
    }

    async function updateStarterStatus(objectId, status) {
        return refereeUpdate({ action: 'setStarterStatus', objectId, status });
    }

    async function fetchStartGroups() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_STARTGROUP?where=${where}&limit=100&order=name`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function updateStartGroupQualiClosed(objectId, qualiClosed) {
        return refereeUpdate({ action: 'setQualiClosed', objectId, qualiClosed });
    }

    function subscribeStartGroups(onChange) {
        const ws = new WebSocket(CONFIG.parseLiveQueryUrl);
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({ op: 'connect', applicationId: CONFIG.parseAppId, javascriptKey: CONFIG.parseJsKey }));
        });
        ws.addEventListener('message', e => {
            const msg = JSON.parse(e.data);
            if (msg.op === 'connected') {
                ws.send(JSON.stringify({
                    op: 'subscribe', requestId: 20,
                    query: { className: 'HT_STARTGROUP', where: {
                        event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId }
                    }},
                }));
            }
            if (['create', 'update', 'delete'].includes(msg.op)) onChange(msg);
        });
        ws.addEventListener('close', () => setTimeout(() => subscribeStartGroups(onChange), 3000));
        return ws;
    }

    async function createFinal(startGroupObjectId) {
        return refereeUpdate({ action: 'createFinal', startGroupObjectId });
    }

    async function fetchFinalEntries(startGroupObjectId) {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
            startGroup: { __type: 'Pointer', className: 'HT_STARTGROUP', objectId: startGroupObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_FINALENTRY?where=${where}&limit=100&order=finalStartNumber&include=starter`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function fetchAllFinalEntries() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_FINALENTRY?where=${where}&limit=500&order=finalStartNumber&include=starter,startGroup`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    function subscribeFinalEntries(onChange) {
        const ws = new WebSocket(CONFIG.parseLiveQueryUrl);
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({ op: 'connect', applicationId: CONFIG.parseAppId, javascriptKey: CONFIG.parseJsKey }));
        });
        ws.addEventListener('message', e => {
            const msg = JSON.parse(e.data);
            if (msg.op === 'connected') {
                ws.send(JSON.stringify({
                    op: 'subscribe', requestId: 30,
                    query: { className: 'HT_FINALENTRY', where: {
                        event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
                    }},
                }));
            }
            if (['create', 'update', 'delete'].includes(msg.op)) onChange();
        });
        ws.addEventListener('close', () => setTimeout(() => subscribeFinalEntries(onChange), 3000));
        return ws;
    }

    async function fetchResultsForStarter(startnumber) {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
            startnumber: Number(startnumber),
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_JURYSCORE?where=${where}&limit=2000&keys=objectId,phase`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function fetchFinalEntriesForStarter(starterObjectId) {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'HT_EVENT', objectId: CONFIG.eventObjectId },
            starter: { __type: 'Pointer', className: 'HT_STARTER', objectId: starterObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/HT_FINALENTRY?where=${where}&limit=500&keys=objectId`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function deleteResultsForStarter(startnumber, starterObjectId) {
        const [scores, finals] = await Promise.all([
            fetchResultsForStarter(startnumber),
            fetchFinalEntriesForStarter(starterObjectId),
        ]);
        for (const obj of scores) {
            const r = await fetch(`${CONFIG.parseServerUrl}/classes/HT_JURYSCORE/${obj.objectId}`,
                { method: 'DELETE', headers: readHeaders() });
            if (!r.ok) throw new Error(`Delete JuryScore failed ${r.status}`);
        }
        for (const obj of finals) {
            const r = await fetch(`${CONFIG.parseServerUrl}/classes/HT_FINALENTRY/${obj.objectId}`,
                { method: 'DELETE', headers: readHeaders() });
            if (!r.ok) throw new Error(`Delete FinalEntry failed ${r.status}`);
        }
        return { scores: scores.length, finals: finals.length };
    }

    async function updateEventSettings(fields) {
        return refereeUpdate({ action: 'updateEventSettings', fields });
    }

    return { login, logout, getSessionUser, fetchAllEvents, fetchEvent, fetchJudges, fetchStartGroups, updateStartGroupQualiClosed, subscribeStartGroups, updateStarterStatus, updateEventSettings, createFinal, fetchFinalEntries, fetchAllFinalEntries, subscribeFinalEntries, fetchStarters, saveStarter, deleteStarter, fetchResultsForStarter, deleteResultsForStarter, saveJuryScore, deleteQualiRun, fetchJuryScores, fetchScoreCountByStarter, fetchFinalScoreCountByStarter, fetchAllJuryScores, subscribeAllJuryScores, subscribeJuryScores, publishActiveStarter, subscribeActiveStarter, heartbeat, removePresence, fetchPresence, subscribePresence };
})();
