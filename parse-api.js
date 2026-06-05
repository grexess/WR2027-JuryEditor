const ParseAPI = (() => {
    let _sessionToken = null;

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

    async function login(username, password) {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            { method: 'GET', headers: readHeaders() }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
        _sessionToken = data.sessionToken;
        return data;
    }

    async function logout() {
        try {
            await fetch(`${CONFIG.parseServerUrl}/logout`, { method: 'POST', headers: writeHeaders() });
        } catch (_) {}
        _sessionToken = null;
    }

    async function fetchAllEvents() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/Event?limit=100&order=name&keys=objectId,name,qualiRuns`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function fetchEvent() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/Event/${CONFIG.eventObjectId}`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const ev = await res.json();
        if (ev.name)          CONFIG.eventName     = ev.name;
        if (ev.criteria)      CONFIG.criteria      = ev.criteria;
        if (ev.presenceStalMs) CONFIG.presenceStalMs = ev.presenceStalMs;
        if (ev.presencePollMs) CONFIG.presencePollMs = ev.presencePollMs;
        if (ev.qualiRuns != null) CONFIG.qualiRuns  = ev.qualiRuns;
        return ev;
    }

    async function fetchJudges() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/Judge?where=${where}&limit=100`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        const judges = data.results ?? [];
        if (judges.length) {
            CONFIG.judgeTokens = Object.fromEntries(judges.map(j => [j.token, j.name]));
        }
        return judges;
    }

    async function fetchStarters() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/Starter?limit=500&order=startNumber&include=startGroup`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        return data.results ?? [];
    }

    async function saveStarter(fields, objectId = null) {
        const url    = objectId
            ? `${CONFIG.parseServerUrl}/classes/Starter/${objectId}`
            : `${CONFIG.parseServerUrl}/classes/Starter`;
        const method = objectId ? 'PUT' : 'POST';
        const res    = await fetch(url, { method, headers: writeHeaders(), body: JSON.stringify(fields) });
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        return res.json();
    }

    async function deleteStarter(objectId) {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/Starter/${objectId}`,
            { method: 'DELETE', headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
    }

    async function saveJuryScore(startnumber, judgeName, scores, criteria) {
        const total = criteria.reduce((a, c) => a + scores[c], 0);
        const body  = { startnumber: Number(startnumber), judgeName, total,
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId } };
        for (const c of CONFIG.criteria) body[c.key] = scores[c.label];
        const res = await fetch(`${CONFIG.parseServerUrl}/classes/JuryScore`, {
            method: 'POST',
            headers: writeHeaders(),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        return res.json();
    }

    async function fetchScoreCountByStarter() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryScore?where=${where}&limit=1000&keys=startnumber`,
            { headers: readHeaders() }
        );
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        const data = await res.json();
        const map = {};
        for (const s of data.results ?? []) {
            map[s.startnumber] = (map[s.startnumber] ?? 0) + 1;
        }
        return map;
    }

    async function fetchJuryScores(startnumber) {
        const where = JSON.stringify({
            startnumber: Number(startnumber),
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        });
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryScore?where=${encodeURIComponent(where)}`,
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
                        className: 'JuryScore',
                        where: {
                            startnumber: Number(startnumber),
                            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
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

    async function publishActiveStarter(startNumber) {
        // Delete any existing record for this event, then create a fresh one.
        // Back4App Live Query fires an 'update' or 'create' event on the subscriber.
        const existing = await fetch(
            `${CONFIG.parseServerUrl}/classes/ActiveStarter?where=${encodeURIComponent(JSON.stringify({ event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId } }))}`,
            { headers: readHeaders() }
        );
        if (!existing.ok) throw new Error(`Parse error ${existing.status}`);
        const { results } = await existing.json();

        if (results?.length) {
            // Update in-place so Live Query fires an 'update' event
            const res = await fetch(
                `${CONFIG.parseServerUrl}/classes/ActiveStarter/${results[0].objectId}`,
                { method: 'PUT', headers: writeHeaders(), body: JSON.stringify({ startNumber }) }
            );
            if (!res.ok) throw new Error(`Parse error ${res.status}`);
        } else {
            const res = await fetch(
                `${CONFIG.parseServerUrl}/classes/ActiveStarter`,
                {
                    method: 'POST',
                    headers: writeHeaders(),
                    body: JSON.stringify({
                        startNumber,
                        event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
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
                        className: 'ActiveStarter',
                        where: {
                            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
                        },
                    },
                }));
            }
            if ((msg.op === 'create' || msg.op === 'update') && msg.object?.startNumber != null) {
                onStartNumber(msg.object.startNumber);
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
        const where = JSON.stringify({ judgeName });
        const existing = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryPresence?where=${encodeURIComponent(where)}&limit=1`,
            { headers: readHeaders() }
        );
        const { results } = await existing.json();
        const body = { lastSeen: { __type: 'Date', iso: new Date().toISOString() } };

        if (results?.length) {
            await fetch(`${CONFIG.parseServerUrl}/classes/JuryPresence/${results[0].objectId}`,
                { method: 'PUT', headers: writeHeaders(), body: JSON.stringify(body) });
        } else {
            await fetch(`${CONFIG.parseServerUrl}/classes/JuryPresence`,
                { method: 'POST', headers: writeHeaders(), body: JSON.stringify({ ...body, judgeName }) });
        }
    }

    async function removePresence(judgeName) {
        const where = JSON.stringify({ judgeName });
        const existing = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryPresence?where=${encodeURIComponent(where)}&limit=1`,
            { headers: readHeaders() }
        );
        const { results } = await existing.json();
        if (results?.length) {
            await fetch(`${CONFIG.parseServerUrl}/classes/JuryPresence/${results[0].objectId}`,
                { method: 'DELETE', headers: readHeaders() });
        }
    }

    async function fetchPresence() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryPresence`,
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
                    query: { className: 'JuryPresence', where: {} },
                }));
            }
            if (['create', 'update', 'delete', 'leave'].includes(msg.op)) onChange();
        });

        ws.addEventListener('close', () => setTimeout(() => subscribePresence(onChange), 3000));

        return ws;
    }

    async function fetchAllJuryScores() {
        const where = encodeURIComponent(JSON.stringify({
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        }));
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryScore?where=${where}&limit=2000&order=createdAt`,
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
                        className: 'JuryScore',
                        where: { event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId } },
                    },
                }));
            }
            if (msg.op === 'create') onChange();
        });
        ws.addEventListener('close', () => setTimeout(() => subscribeAllJuryScores(onChange), 3000));
        return ws;
    }

    return { login, logout, fetchAllEvents, fetchEvent, fetchJudges, fetchStarters, saveStarter, deleteStarter, saveJuryScore, fetchJuryScores, fetchScoreCountByStarter, fetchAllJuryScores, subscribeAllJuryScores, subscribeJuryScores, publishActiveStarter, subscribeActiveStarter, heartbeat, removePresence, fetchPresence, subscribePresence };
})();
