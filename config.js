const CONFIG = (() => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('werace-event') ?? 'null'); } catch { return null; } })();
    return {
        // Parse connection — must stay here, needed before any fetch
        parseServerUrl: 'https://parseapi.back4app.com',
        parseLiveQueryUrl: 'wss://werace.b4a.io',
        parseAppId: 'dzIL6ltm4ccW5erqzoFasEuAJXvoAUwev61xUJca',
        parseJsKey: 'CqWP8C1y7EbLYzttuvs0B35vzrQUhXihWK8SI8Hq',

        // Active event — set by index.html picker, persisted in localStorage
        eventObjectId: saved?.objectId ?? null,
        eventName: saved?.name ?? 'WeRace',

        // Judge auth tokens — populated from Parse Judge class after event is chosen
        judgeTokens: {},

        // Operational defaults — overridden by values from the Event object once loaded
        presenceStalMs: 45000,
        presencePollMs: 15000,
        qualiRuns: null,
        finalRuns: null,
        bestOf: 8,
        refereeToken: null,
        qualiScoreMode: 'sum', // 'sum' | 'best'
        finalScoreMode: 'sum', // 'sum' | 'best'
        criteria: [
            { label: 'Schwierigkeit', shortLabel: 'Schw.', key: 'score1' },
            { label: 'Ausführung', shortLabel: 'Ausf.', key: 'score2' },
            { label: 'Amplitude', shortLabel: 'Ampl.', key: 'score3' },
        ],
    };
})();
