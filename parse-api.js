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

    async function fetchStarters() {
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/Starter?limit=500&order=startNumber`,
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
        const body  = {
            startnumber:   Number(startnumber),
            judgeName,
            schwierigkeit: scores['Schwierigkeit'],
            ausfuehrung:   scores['Ausführung'],
            amplitude:     scores['Amplitude'],
            total,
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        };
        const res = await fetch(`${CONFIG.parseServerUrl}/classes/JuryScore`, {
            method: 'POST',
            headers: writeHeaders(),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Parse error ${res.status}`);
        return res.json();
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

    const PRESENCE_STALE_MS = 60000; // judge considered offline after 60 s

    async function heartbeat(judgeName) {
        const where = JSON.stringify({
            judgeName,
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        });
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
                { method: 'POST', headers: writeHeaders(), body: JSON.stringify({
                    ...body, judgeName,
                    event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
                })});
        }
    }

    async function removePresence(judgeName) {
        const where = JSON.stringify({
            judgeName,
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        });
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
        const where = JSON.stringify({
            event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId },
        });
        const res = await fetch(
            `${CONFIG.parseServerUrl}/classes/JuryPresence?where=${encodeURIComponent(where)}`,
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
                        className: 'JuryPresence',
                        where: { event: { __type: 'Pointer', className: 'Event', objectId: CONFIG.eventObjectId } },
                    },
                }));
            }
            if (['create', 'update', 'delete', 'leave'].includes(msg.op)) onChange();
        });

        ws.addEventListener('close', () => setTimeout(() => subscribePresence(onChange), 3000));

        return ws;
    }

    return { login, logout, fetchStarters, saveStarter, deleteStarter, saveJuryScore, fetchJuryScores, subscribeJuryScores, publishActiveStarter, subscribeActiveStarter, heartbeat, removePresence, fetchPresence, subscribePresence };
})();
