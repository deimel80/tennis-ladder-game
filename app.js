const VERSION = "0.1.1";
const STORAGE_SESSION_KEY = "tennis_ladder_session_v010";
const STORAGE_DEMO_KEY = "tennis_ladder_demo_db_v010";

const SERVES = [
  { id: "slice_wide", label: "Slice außen", family: "slice", zone: "wide", fault: 0.08, power: 0.70, ace: 0.06 },
  { id: "slice_middle", label: "Slice Mitte", family: "slice", zone: "middle", fault: 0.06, power: 0.56, ace: 0.035 },
  { id: "kick_middle", label: "Kick Mitte", family: "kick", zone: "middle", fault: 0.05, power: 0.62, ace: 0.035 },
  { id: "kick_body", label: "Kick auf Körper", family: "kick", zone: "body", fault: 0.055, power: 0.66, ace: 0.025 },
  { id: "flat_t", label: "Glatt durch die Mitte", family: "flat", zone: "middle", fault: 0.11, power: 0.86, ace: 0.08 },
  { id: "body", label: "Hart auf Körper", family: "flat", zone: "body", fault: 0.09, power: 0.78, ace: 0.045 }
];

const BASELINE_SHOTS = [
  { id: "topspin_cross", label: "Topspin cross", family: "topspin", zone: "cross", error: 0.06, winner: 0.045, force: 0.08 },
  { id: "topspin_line", label: "Topspin longline", family: "topspin", zone: "line", error: 0.085, winner: 0.07, force: 0.09 },
  { id: "slice_short", label: "Slice kurz", family: "slice", zone: "short", error: 0.055, winner: 0.025, force: 0.07 },
  { id: "drop_shot", label: "Stoppball", family: "touch", zone: "short", error: 0.12, winner: 0.09, force: 0.08 },
  { id: "lob", label: "Lob", family: "defense", zone: "deep", error: 0.075, winner: 0.035, force: 0.09 },
  { id: "approach_net", label: "Angriff ans Netz", family: "attack", zone: "deep", error: 0.095, winner: 0.045, force: 0.13, approach: true }
];

const NET_SHOTS = [
  { id: "volley", label: "Volley wegdrücken", family: "volley", zone: "open", error: 0.075, winner: 0.13, force: 0.12 },
  { id: "stop_volley", label: "Stopp-Volley", family: "touch", zone: "short", error: 0.115, winner: 0.14, force: 0.08 },
  { id: "smash", label: "Smash", family: "overhead", zone: "deep", error: 0.095, winner: 0.20, force: 0.10 }
];

const PASSING_SHOTS = [
  { id: "passing_cross", label: "Passierball cross", family: "passing", zone: "cross", error: 0.10, winner: 0.12, force: 0.10 },
  { id: "passing_line", label: "Passierball longline", family: "passing", zone: "line", error: 0.12, winner: 0.15, force: 0.09 },
  { id: "lob", label: "Lob über Netzspieler", family: "defense", zone: "deep", error: 0.085, winner: 0.065, force: 0.14 },
  { id: "topspin_hard", label: "Hart auf die Füße", family: "topspin", zone: "body", error: 0.095, winner: 0.08, force: 0.15 }
];

const DEMO_PLAYERS = ["Stefan", "Alex", "Ben", "Chris", "Daniel", "Markus"];

const app = document.getElementById("app");
const toastHost = document.getElementById("toastHost");
const connectionBadge = document.getElementById("connectionBadge");
const versionBadge = document.getElementById("versionBadge");

const state = {
  store: null,
  isRemote: false,
  session: null,
  lobby: null,
  view: "loading",
  selectedChallenge: null,
  game: null
};

versionBadge.textContent = `v${VERSION}`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function asPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function showToast(message) {
  const template = document.getElementById("toastTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  toastHost.appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}

function setConnectionBadge(mode, text) {
  connectionBadge.className = `connection-badge ${mode}`;
  connectionBadge.textContent = text;
}

function statusLabel(status) {
  const labels = {
    open: "offen",
    accepted: "angenommen",
    completed: "gespielt",
    cancelled: "abgebrochen",
    declined: "abgelehnt"
  };
  return labels[status] || status;
}

function normalizePlayer(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    display_name: raw.display_name || raw.name,
    rank_position: Number(raw.rank_position || raw.rank || 0),
    wins: Number(raw.wins || 0),
    losses: Number(raw.losses || 0),
    points_for: Number(raw.points_for || 0),
    points_against: Number(raw.points_against || 0)
  };
}

class RemoteStore {
  constructor(url, key) {
    this.client = window.supabase.createClient(url, key);
  }

  async registerPlayer(displayName, pin) {
    const { data, error } = await this.client.rpc("register_player", {
      p_display_name: displayName,
      p_pin: pin
    });
    if (error) throw error;
    return this.normalizeSession(data);
  }

  async loginPlayer(displayName, pin) {
    const { data, error } = await this.client.rpc("login_player", {
      p_display_name: displayName,
      p_pin: pin
    });
    if (error) throw error;
    return this.normalizeSession(data);
  }

  async getLobby() {
    const { data, error } = await this.client.rpc("get_lobby", {
      p_session_token: state.session?.token || null
    });
    if (error) throw error;
    return this.normalizeLobby(data);
  }

  async createChallenge(challengedId) {
    const { data, error } = await this.client.rpc("create_challenge", {
      p_session_token: state.session?.token,
      p_challenged_id: challengedId
    });
    if (error) throw error;
    return data;
  }

  async acceptChallenge(challengeId) {
    const { data, error } = await this.client.rpc("accept_challenge", {
      p_session_token: state.session?.token,
      p_challenge_id: challengeId
    });
    if (error) throw error;
    return data;
  }

  async cancelChallenge(challengeId) {
    const { data, error } = await this.client.rpc("cancel_challenge", {
      p_session_token: state.session?.token,
      p_challenge_id: challengeId
    });
    if (error) throw error;
    return data;
  }

  async submitMatch(payload) {
    const { data, error } = await this.client.rpc("submit_match", {
      p_session_token: state.session?.token,
      p_challenge_id: payload.challengeId || null,
      p_player_a_id: payload.playerAId,
      p_player_b_id: payload.playerBId,
      p_winner_id: payload.winnerId,
      p_score_a: payload.scoreA,
      p_score_b: payload.scoreB,
      p_match_log: payload.matchLog
    });
    if (error) throw error;
    return data;
  }

  normalizeSession(data) {
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    return {
      token: payload.session_token,
      player: normalizePlayer(payload.player)
    };
  }

  normalizeLobby(data) {
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    return {
      players: (payload.players || []).map(normalizePlayer),
      challenges: payload.challenges || [],
      recent_matches: payload.recent_matches || []
    };
  }
}

class DemoStore {
  constructor() {
    this.db = this.loadDb();
  }

  loadDb() {
    const existing = localStorage.getItem(STORAGE_DEMO_KEY);
    if (existing) return JSON.parse(existing);

    const players = DEMO_PLAYERS.map((name, index) => ({
      id: randomId(),
      display_name: name,
      pin: "1234",
      rank_position: index + 1,
      wins: 0,
      losses: 0,
      points_for: 0,
      points_against: 0,
      created_at: nowIso()
    }));
    const db = { players, challenges: [], matches: [] };
    localStorage.setItem(STORAGE_DEMO_KEY, JSON.stringify(db));
    return db;
  }

  saveDb() {
    localStorage.setItem(STORAGE_DEMO_KEY, JSON.stringify(this.db));
  }

  async registerPlayer(displayName, pin) {
    const cleanName = displayName.trim();
    if (!cleanName || cleanName.length < 2) throw new Error("Name zu kurz.");
    if (!/^\d{4}$/.test(pin)) throw new Error("PIN muss aus 4 Ziffern bestehen.");
    if (this.db.players.some(p => p.display_name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error("Diesen Spieler gibt es bereits.");
    }
    const player = {
      id: randomId(),
      display_name: cleanName,
      pin,
      rank_position: this.db.players.length + 1,
      wins: 0,
      losses: 0,
      points_for: 0,
      points_against: 0,
      created_at: nowIso()
    };
    this.db.players.push(player);
    this.saveDb();
    return { token: randomId(), player: normalizePlayer(player) };
  }

  async loginPlayer(displayName, pin) {
    const player = this.db.players.find(p => p.display_name.toLowerCase() === displayName.trim().toLowerCase());
    if (!player || player.pin !== pin) throw new Error("Name oder PIN falsch. Demo-Spieler haben PIN 1234.");
    return { token: randomId(), player: normalizePlayer(player) };
  }

  async getLobby() {
    return {
      players: this.db.players.map(normalizePlayer).sort((a, b) => a.rank_position - b.rank_position),
      challenges: this.db.challenges
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 30),
      recent_matches: this.db.matches
        .slice()
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
        .slice(0, 10)
    };
  }

  async createChallenge(challengedId) {
    const challenger = this.findCurrentPlayer();
    const challenged = this.db.players.find(p => p.id === challengedId);
    if (!challenger || !challenged) throw new Error("Spieler nicht gefunden.");
    if (challenger.id === challenged.id) throw new Error("Du kannst dich nicht selbst fordern.");
    const duplicate = this.db.challenges.find(c =>
      c.status !== "completed" && c.status !== "cancelled" &&
      ((c.challenger_id === challenger.id && c.challenged_id === challenged.id) ||
       (c.challenger_id === challenged.id && c.challenged_id === challenger.id))
    );
    if (duplicate) throw new Error("Zwischen diesen Spielern gibt es bereits eine offene Forderung.");

    const challenge = this.decorateChallenge({
      id: randomId(),
      challenger_id: challenger.id,
      challenged_id: challenged.id,
      status: "open",
      created_at: nowIso(),
      accepted_at: null,
      completed_at: null,
      winner_id: null,
      loser_id: null,
      match_id: null
    });
    this.db.challenges.push(challenge);
    this.saveDb();
    return challenge;
  }

  async acceptChallenge(challengeId) {
    const current = this.findCurrentPlayer();
    const challenge = this.db.challenges.find(c => c.id === challengeId);
    if (!challenge) throw new Error("Forderung nicht gefunden.");
    if (challenge.challenged_id !== current.id) throw new Error("Nur der geforderte Spieler kann annehmen.");
    if (challenge.status !== "open") throw new Error("Diese Forderung ist nicht offen.");
    challenge.status = "accepted";
    challenge.accepted_at = nowIso();
    this.saveDb();
    return challenge;
  }

  async cancelChallenge(challengeId) {
    const current = this.findCurrentPlayer();
    const challenge = this.db.challenges.find(c => c.id === challengeId);
    if (!challenge) throw new Error("Forderung nicht gefunden.");
    if (![challenge.challenger_id, challenge.challenged_id].includes(current.id)) {
      throw new Error("Nur beteiligte Spieler können abbrechen.");
    }
    if (!["open", "accepted"].includes(challenge.status)) throw new Error("Diese Forderung kann nicht mehr abgebrochen werden.");
    challenge.status = "cancelled";
    this.saveDb();
    return challenge;
  }

  async submitMatch(payload) {
    const playerA = this.db.players.find(p => p.id === payload.playerAId);
    const playerB = this.db.players.find(p => p.id === payload.playerBId);
    const winner = this.db.players.find(p => p.id === payload.winnerId);
    const loser = winner?.id === playerA?.id ? playerB : playerA;
    if (!playerA || !playerB || !winner || !loser) throw new Error("Spielerdaten unvollständig.");

    const match = {
      id: randomId(),
      challenge_id: payload.challengeId || null,
      player_a_id: playerA.id,
      player_b_id: playerB.id,
      player_a_name: playerA.display_name,
      player_b_name: playerB.display_name,
      winner_id: winner.id,
      winner_name: winner.display_name,
      loser_id: loser.id,
      loser_name: loser.display_name,
      score_a: payload.scoreA,
      score_b: payload.scoreB,
      match_log: payload.matchLog,
      completed_at: nowIso()
    };
    this.db.matches.push(match);

    winner.wins += 1;
    loser.losses += 1;
    winner.points_for += winner.id === playerA.id ? payload.scoreA : payload.scoreB;
    winner.points_against += winner.id === playerA.id ? payload.scoreB : payload.scoreA;
    loser.points_for += loser.id === playerA.id ? payload.scoreA : payload.scoreB;
    loser.points_against += loser.id === playerA.id ? payload.scoreB : payload.scoreA;
    this.applyRankingChange(winner, loser);

    if (payload.challengeId) {
      const challenge = this.db.challenges.find(c => c.id === payload.challengeId);
      if (challenge) {
        challenge.status = "completed";
        challenge.completed_at = nowIso();
        challenge.match_id = match.id;
        challenge.winner_id = winner.id;
        challenge.loser_id = loser.id;
        Object.assign(challenge, this.decorateChallenge(challenge));
      }
    }

    this.saveDb();
    return match;
  }

  applyRankingChange(winner, loser) {
    const winnerRank = winner.rank_position;
    const loserRank = loser.rank_position;
    if (winnerRank <= loserRank) return;

    this.db.players.forEach(player => {
      if (player.id === winner.id) {
        player.rank_position = loserRank;
      } else if (player.rank_position >= loserRank && player.rank_position < winnerRank) {
        player.rank_position += 1;
      }
    });
  }

  findCurrentPlayer() {
    return this.db.players.find(p => p.id === state.session?.player?.id);
  }

  decorateChallenge(challenge) {
    const challenger = this.db.players.find(p => p.id === challenge.challenger_id);
    const challenged = this.db.players.find(p => p.id === challenge.challenged_id);
    const winner = this.db.players.find(p => p.id === challenge.winner_id);
    const loser = this.db.players.find(p => p.id === challenge.loser_id);
    return {
      ...challenge,
      challenger_name: challenger?.display_name || "?",
      challenger_rank: challenger?.rank_position || null,
      challenged_name: challenged?.display_name || "?",
      challenged_rank: challenged?.rank_position || null,
      winner_name: winner?.display_name || null,
      loser_name: loser?.display_name || null
    };
  }
}

async function init() {
  const config = window.TENNIS_CONFIG || {};
  const hasRemoteConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);

  if (hasRemoteConfig) {
    state.isRemote = true;
    state.store = new RemoteStore(config.supabaseUrl, config.supabaseAnonKey);
    setConnectionBadge("ok", "Supabase aktiv");
  } else {
    state.isRemote = false;
    state.store = new DemoStore();
    setConnectionBadge("demo", "Demo-Modus");
  }

  const storedSession = localStorage.getItem(STORAGE_SESSION_KEY);
  if (storedSession) {
    try {
      state.session = JSON.parse(storedSession);
    } catch {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }

  await refreshLobby(false);
  state.view = state.session ? "lobby" : "setup";
  render();
}

async function refreshLobby(showMessage = true) {
  state.lobby = await state.store.getLobby();
  if (showMessage) showToast("Rangliste aktualisiert.");
}

function saveSession(session) {
  state.session = session;
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  state.session = null;
  localStorage.removeItem(STORAGE_SESSION_KEY);
}

function render() {
  if (state.view === "setup") return renderSetup();
  if (state.view === "lobby") return renderLobby();
  if (state.view === "match") return renderMatch();
  renderLoading();
}

function renderLoading() {
  app.innerHTML = `
    <section class="card loading-card">
      <div class="spinner" aria-hidden="true"></div>
      <div>
        <h2>Spiel wird geladen</h2>
        <p>Konfiguration und Rangliste werden vorbereitet.</p>
      </div>
    </section>`;
}

function renderSetup() {
  const players = state.lobby?.players || [];
  const recentMatches = state.lobby?.recent_matches || [];

  app.innerHTML = `
    <section class="grid two">
      <div class="grid">
        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Rangliste</h2>
              <p class="muted">Die aktuelle Tabelle ist öffentlich sichtbar. Zum Fordern oder Spielen bitte anmelden.</p>
            </div>
            <button class="btn ghost" data-action="refresh-public">Aktualisieren</button>
          </div>
          ${renderRankingTable(players, null, { showActions: false })}
        </div>

        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Anmelden</h2>
              <p class="muted">Melde dich mit Spielername und 4-stelliger PIN an.</p>
            </div>
            ${state.isRemote ? "" : `<span class="pill danger">nicht zentral</span>`}
          </div>

          ${state.isRemote ? `
            <div class="success small">Supabase ist konfiguriert. Rangliste, Forderungen und Matches werden zentral gespeichert.</div>
          ` : `
            <div class="notice small"><strong>Demo-Modus:</strong> Ohne Supabase-Konfiguration wird nur in diesem Browser gespeichert. Für deine Kumpel muss config.js mit Supabase-Werten gefüllt und database.sql ausgeführt werden.</div>
          `}

          <div class="setup-columns" style="margin-top: 16px;">
            <form id="loginForm" class="card compact form-grid">
              <h3>Login</h3>
              <label class="field">
                <span>Spielername</span>
                <input id="loginName" autocomplete="username" placeholder="z. B. Stefan" required />
              </label>
              <label class="field">
                <span>PIN</span>
                <input id="loginPin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="1234" required />
              </label>
              <button class="btn primary" type="submit">Einloggen</button>
              ${state.isRemote ? "" : `<p class="muted small">Demo-Spieler: Stefan, Alex, Ben, Chris, Daniel, Markus · PIN jeweils 1234</p>`}
            </form>

            <form id="registerForm" class="card compact form-grid">
              <h3>Neuen Spieler anlegen</h3>
              <label class="field">
                <span>Spielername</span>
                <input id="registerName" autocomplete="username" placeholder="Name" required />
              </label>
              <label class="field">
                <span>4-stellige PIN</span>
                <input id="registerPin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="0000" required />
              </label>
              <button class="btn" type="submit">Spieler erstellen</button>
            </form>
          </div>
        </div>
      </div>

      <aside class="grid">
        <div class="card compact">
          <h2>Regelstand v${VERSION}</h2>
          <ul class="log-list small">
            <li class="log-item"><strong>Match:</strong> Match-Tiebreak bis 10, Sieg immer mit 2 Punkten Vorsprung.</li>
            <li class="log-item"><strong>Aufschlag:</strong> Münzwurf entscheidet den ersten Aufschläger. Danach 1–2–2–2.</li>
            <li class="log-item"><strong>Risiko:</strong> Jeder Schlag nutzt 0–150 %. Viel Risiko erzeugt mehr Druck, aber auch mehr Fehler.</li>
            <li class="log-item"><strong>Lesen:</strong> Wenn der Gegner den Schlag exakt erwartet, steigen Return- und Konterchancen deutlich.</li>
            <li class="log-item"><strong>Rally:</strong> Je länger der Ballwechsel, desto höher die Fehlerwahrscheinlichkeit.</li>
          </ul>
        </div>

        <div class="card compact">
          <h2>Letzte Matches</h2>
          ${renderRecentMatches(recentMatches)}
        </div>
      </aside>
    </section>`;
}
function renderLobby() {
  const currentId = state.session?.player?.id;
  const players = state.lobby?.players || [];
  const current = players.find(p => p.id === currentId) || state.session?.player;
  const challenges = state.lobby?.challenges || [];
  const recentMatches = state.lobby?.recent_matches || [];

  app.innerHTML = `
    <section class="grid two">
      <div class="grid">
        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Rangliste</h2>
              <p class="muted">Angemeldet als <strong>${escapeHtml(current?.display_name || "?")}</strong>. Fordere einen Spieler oder starte ein direktes Match.</p>
            </div>
            <div class="btn-row">
              <button class="btn ghost" data-action="refresh">Aktualisieren</button>
              <button class="btn ghost" data-action="logout">Abmelden</button>
            </div>
          </div>
          ${renderRankingTable(players, currentId)}
        </div>

        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Offene Forderungen</h2>
              <p class="muted">Eine angenommene Forderung kann direkt als Match-Tiebreak gespielt werden.</p>
            </div>
          </div>
          ${renderChallenges(challenges, currentId)}
        </div>
      </div>

      <aside class="grid">
        <div class="card compact">
          <h2>Dein Stand</h2>
          <div class="grid three">
            <div class="score-card"><span class="label">Rang</span><div class="score-number" style="font-size:3rem">${current?.rank_position || "-"}</div></div>
            <div class="score-card"><span class="label">Siege</span><div class="score-number" style="font-size:3rem">${current?.wins || 0}</div></div>
            <div class="score-card"><span class="label">Niederlagen</span><div class="score-number" style="font-size:3rem">${current?.losses || 0}</div></div>
          </div>
        </div>

        <div class="card compact">
          <h2>Letzte Matches</h2>
          ${renderRecentMatches(recentMatches)}
        </div>

        ${state.isRemote ? "" : `
          <div class="card compact">
            <h2>Demo-Daten</h2>
            <p class="muted small">Löscht nur die lokalen Demo-Spieler, Forderungen und Matches in diesem Browser.</p>
            <button class="btn danger" data-action="reset-demo">Demo zurücksetzen</button>
          </div>`}
      </aside>
    </section>`;
}

function renderRankingTable(players, currentId, options = {}) {
  const showActions = options.showActions !== false;
  const rows = players.map(player => {
    const isSelf = player.id === currentId;
    return `
      <tr>
        <td><span class="rank">${player.rank_position}</span></td>
        <td><strong>${escapeHtml(player.display_name)}</strong>${isSelf ? ` <span class="pill">du</span>` : ""}</td>
        <td>${player.wins}</td>
        <td>${player.losses}</td>
        <td>${player.points_for}:${player.points_against}</td>
        <td>
          ${!showActions ? `<span class="muted small">Login nötig</span>` : isSelf ? "" : `
            <div class="btn-row">
              <button class="btn primary" data-action="challenge" data-player-id="${player.id}">Fordern</button>
              <button class="btn" data-action="direct-match" data-player-id="${player.id}">Direkt-Match</button>
            </div>`}
        </td>
      </tr>`;
  }).join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Rang</th><th>Spieler</th><th>S</th><th>N</th><th>Punkte</th><th>Aktion</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6">Noch keine Spieler vorhanden.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderChallenges(challenges, currentId) {
  if (!challenges.length) return `<p class="muted">Noch keine Forderungen vorhanden.</p>`;

  return `
    <ul class="challenge-list">
      ${challenges.map(challenge => {
        const isChallenger = challenge.challenger_id === currentId;
        const isChallenged = challenge.challenged_id === currentId;
        const isParticipant = isChallenger || isChallenged;
        const canAccept = challenge.status === "open" && isChallenged;
        const canPlay = challenge.status === "accepted" && isParticipant;
        const canCancel = ["open", "accepted"].includes(challenge.status) && isParticipant;
        const created = challenge.created_at ? new Date(challenge.created_at).toLocaleString("de-DE") : "";
        return `
          <li class="challenge-item">
            <div class="challenge-title">
              <span>#${challenge.challenger_rank || "?"} ${escapeHtml(challenge.challenger_name)} fordert #${challenge.challenged_rank || "?"} ${escapeHtml(challenge.challenged_name)}</span>
              <span class="status ${challenge.status}">${statusLabel(challenge.status)}</span>
            </div>
            <p class="muted small">${created}${challenge.winner_name ? ` · Sieger: ${escapeHtml(challenge.winner_name)}` : ""}</p>
            <div class="btn-row">
              ${canAccept ? `<button class="btn primary" data-action="accept" data-challenge-id="${challenge.id}">Annehmen</button>` : ""}
              ${canPlay ? `<button class="btn primary" data-action="play-challenge" data-challenge-id="${challenge.id}">Match spielen</button>` : ""}
              ${canCancel ? `<button class="btn danger" data-action="cancel" data-challenge-id="${challenge.id}">Abbrechen</button>` : ""}
            </div>
          </li>`;
      }).join("")}
    </ul>`;
}

function renderRecentMatches(matches) {
  if (!matches.length) return `<p class="muted small">Noch keine gespeicherten Matches.</p>`;
  return `
    <ul class="log-list small">
      ${matches.map(match => `
        <li class="log-item">
          <strong>${escapeHtml(match.winner_name)}</strong> gewinnt gegen ${escapeHtml(match.loser_name)}
          <br>${escapeHtml(match.player_a_name)} ${match.score_a}:${match.score_b} ${escapeHtml(match.player_b_name)}
        </li>`).join("")}
    </ul>`;
}

function renderMatch() {
  const game = state.game;
  if (!game) {
    state.view = "lobby";
    return renderLobby();
  }

  app.innerHTML = `
    <section class="grid">
      <div class="card">
        <div class="card-title-row">
          <div>
            <h2>Match-Tiebreak</h2>
            <p class="muted">${escapeHtml(game.playerA.display_name)} gegen ${escapeHtml(game.playerB.display_name)} · erster Aufschlag laut Münzwurf: <strong>${escapeHtml(getSidePlayer(game.firstServerSide).display_name)}</strong></p>
          </div>
          <button class="btn ghost" data-action="back-lobby">Zur Rangliste</button>
        </div>
        ${renderScoreboard()}
        <div class="phase-panel">${renderMatchPhase()}</div>
      </div>

      <div class="grid two">
        <div class="card compact">
          <h2>Punkt-Protokoll</h2>
          ${renderPointLog()}
        </div>
        <div class="card compact">
          <h2>Match-Log</h2>
          ${renderMatchLog()}
        </div>
      </div>
    </section>`;

  syncRangeLabels();
}

function renderScoreboard() {
  const game = state.game;
  const serverSide = getServerSideForPoint();
  const totalPoints = game.scoreA + game.scoreB;
  const nextInfo = `Punkt ${totalPoints + 1} · Aufschlag: ${getSidePlayer(serverSide).display_name}`;

  return `
    <div class="scoreboard">
      <div class="score-player ${serverSide === "a" ? "active" : ""}">
        <div class="score-name">${escapeHtml(game.playerA.display_name)}${serverSide === "a" ? " · Aufschlag" : ""}</div>
        <div class="score-number">${game.scoreA}</div>
      </div>
      <div class="score-middle">
        <span class="pill">${escapeHtml(nextInfo)}</span>
        <span class="small">Sieg ab 10 mit 2 Punkten Abstand</span>
      </div>
      <div class="score-player ${serverSide === "b" ? "active" : ""}">
        <div class="score-name">${escapeHtml(game.playerB.display_name)}${serverSide === "b" ? " · Aufschlag" : ""}</div>
        <div class="score-number">${game.scoreB}</div>
      </div>
    </div>`;
}

function renderMatchPhase() {
  const game = state.game;
  if (game.phase === "serve") return renderServePhase();
  if (game.phase === "rally") return renderRallyPhase();
  if (game.phase === "pointResult") return renderPointResultPhase();
  if (game.phase === "matchOver") return renderMatchOverPhase();
  return `<p>Unbekannte Phase.</p>`;
}

function renderServePhase() {
  const game = state.game;
  const serverSide = getServerSideForPoint();
  const returnerSide = otherSide(serverSide);
  const server = getSidePlayer(serverSide);
  const returner = getSidePlayer(returnerSide);
  const title = game.isSecondServe ? "Zweiter Aufschlag" : "Erster Aufschlag";

  return `
    <div class="choice-grid">
      <div class="choice-card form-grid">
        <h3>${escapeHtml(server.display_name)} · ${title}</h3>
        <label class="field">
          <span>Aufschlag wählen</span>
          <select id="serveType">${SERVES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
        </label>
        ${renderRiskField("serveRisk", 92)}
      </div>
      <div class="choice-card form-grid">
        <h3>${escapeHtml(returner.display_name)} · Return einstellen</h3>
        <label class="field">
          <span>Worauf stellst du dich ein?</span>
          <select id="returnRead">${SERVES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
        </label>
        ${renderRiskField("returnRisk", 82)}
      </div>
    </div>
    <div class="btn-row" style="margin-top: 14px;">
      <button class="btn primary" data-action="play-serve">Aufschlag ausspielen</button>
    </div>`;
}

function renderRallyPhase() {
  const game = state.game;
  const activeSide = game.activeSide;
  const defenderSide = otherSide(activeSide);
  const activePlayer = getSidePlayer(activeSide);
  const defender = getSidePlayer(defenderSide);
  const shots = availableShotsFor(activeSide);

  return `
    <div class="choice-grid">
      <div class="choice-card form-grid">
        <h3>${escapeHtml(activePlayer.display_name)} · Schlag ${game.rallyCount + 1}</h3>
        <p class="muted small">Position: ${game.positions[activeSide] === "net" ? "am Netz" : "Grundlinie"}</p>
        <label class="field">
          <span>Schlag wählen</span>
          <select id="rallyShot">${shots.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
        </label>
        ${renderRiskField("shotRisk", 88)}
      </div>
      <div class="choice-card form-grid">
        <h3>${escapeHtml(defender.display_name)} · Lesen / einstellen</h3>
        <p class="muted small">Je genauer du liest, desto besser die Chance auf Konter oder Fehler beim Gegner.</p>
        <label class="field">
          <span>Erwarteter Schlag</span>
          <select id="rallyRead">${shots.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select>
        </label>
        ${renderRiskField("defenseRisk", 78)}
      </div>
    </div>
    <div class="btn-row" style="margin-top: 14px;">
      <button class="btn primary" data-action="play-rally">Ballwechsel weiterspielen</button>
    </div>`;
}

function renderRiskField(id, value) {
  return `
    <label class="field">
      <span>Risiko</span>
      <div class="range-row">
        <input id="${id}" type="range" min="0" max="150" value="${value}" data-range-label="${id}Value" />
        <strong id="${id}Value" class="risk-value">${value}%</strong>
      </div>
    </label>`;
}

function renderPointResultPhase() {
  const game = state.game;
  return `
    <div class="choice-card">
      <p class="point-text">${escapeHtml(game.lastPointText)}</p>
      <p class="muted">Punkt an <strong>${escapeHtml(getSidePlayer(game.lastPointWinner).display_name)}</strong>.</p>
      <button class="btn primary" data-action="next-point">Nächster Punkt</button>
    </div>`;
}

function renderMatchOverPhase() {
  const game = state.game;
  const winner = getMatchWinnerSide();
  return `
    <div class="choice-card">
      <p class="point-text">Match beendet: ${escapeHtml(getSidePlayer(winner).display_name)} gewinnt ${game.scoreA}:${game.scoreB}.</p>
      <p class="muted">Das Ergebnis wird in Supabase gespeichert, wenn Supabase konfiguriert ist. Im Demo-Modus bleibt es nur in diesem Browser.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="save-match">Ergebnis speichern</button>
        <button class="btn ghost" data-action="back-lobby">Nicht speichern</button>
      </div>
    </div>`;
}

function renderPointLog() {
  const log = state.game?.currentPointLog || [];
  if (!log.length) return `<p class="muted small">Noch keine Aktion in diesem Punkt.</p>`;
  return `<ul class="log-list small">${log.map(item => `<li class="log-item">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMatchLog() {
  const points = state.game?.matchLog || [];
  if (!points.length) return `<p class="muted small">Nach jedem Punkt erscheint hier die Kurzfassung.</p>`;
  return `<ul class="log-list small">${points.slice().reverse().map((point, index) => `
    <li class="log-item">
      <strong>Punkt ${points.length - index}</strong><br>
      ${escapeHtml(point.summary)}<br>
      <span class="muted">Zwischenstand: ${point.scoreA}:${point.scoreB}</span>
    </li>`).join("")}</ul>`;
}

function syncRangeLabels() {
  document.querySelectorAll("input[type='range'][data-range-label]").forEach(range => {
    const label = document.getElementById(range.dataset.rangeLabel);
    if (label) label.textContent = `${range.value}%`;
  });
}

function getSidePlayer(side) {
  return side === "a" ? state.game.playerA : state.game.playerB;
}

function otherSide(side) {
  return side === "a" ? "b" : "a";
}

function getServerSideForPoint() {
  const game = state.game;
  const totalPointsPlayed = game.scoreA + game.scoreB;
  if (totalPointsPlayed === 0) return game.firstServerSide;
  const block = Math.floor((totalPointsPlayed - 1) / 2);
  return block % 2 === 0 ? otherSide(game.firstServerSide) : game.firstServerSide;
}

function getMatchWinnerSide() {
  return state.game.scoreA > state.game.scoreB ? "a" : "b";
}

function isMatchOver() {
  const { scoreA, scoreB } = state.game;
  return Math.max(scoreA, scoreB) >= 10 && Math.abs(scoreA - scoreB) >= 2;
}

function findServe(id) {
  return SERVES.find(item => item.id === id) || SERVES[0];
}

function findShot(id, activeSide) {
  return availableShotsFor(activeSide).find(item => item.id === id) || availableShotsFor(activeSide)[0];
}

function matchFit(actual, expected) {
  if (!actual || !expected) return 0.25;
  if (actual.id === expected.id) return 1;
  if (actual.family === expected.family && actual.zone === expected.zone) return 0.82;
  if (actual.family === expected.family) return 0.62;
  if (actual.zone === expected.zone) return 0.46;
  if ((actual.zone === "body" && expected.zone === "middle") || (actual.zone === "middle" && expected.zone === "body")) return 0.38;
  return 0.16;
}

function riskErrorTerm(risk, scaleHigh = 0.26, scaleLow = 0.045) {
  const numeric = Number(risk);
  if (numeric > 100) return scaleHigh * Math.pow((numeric - 100) / 50, 1.32);
  return -scaleLow * ((100 - numeric) / 100);
}

function riskPowerTerm(risk) {
  return Number(risk) / 100;
}

function availableShotsFor(activeSide) {
  const game = state.game;
  const defenderSide = otherSide(activeSide);
  if (game.positions[activeSide] === "net") return NET_SHOTS;
  if (game.positions[defenderSide] === "net") return PASSING_SHOTS;
  return BASELINE_SHOTS;
}

function startGame(playerA, playerB, challenge = null) {
  const firstServerSide = Math.random() < 0.5 ? "a" : "b";
  state.selectedChallenge = challenge;
  state.game = {
    playerA,
    playerB,
    scoreA: 0,
    scoreB: 0,
    firstServerSide,
    phase: "serve",
    isSecondServe: false,
    activeSide: null,
    positions: { a: "baseline", b: "baseline" },
    rallyCount: 0,
    rallyPressure: 0,
    currentPointLog: [`Münzwurf: ${getPlayerNameBySide(firstServerSide, playerA, playerB)} schlägt zuerst auf.`],
    matchLog: [],
    lastPointWinner: null,
    lastPointText: ""
  };
  state.view = "match";
  render();
}

function getPlayerNameBySide(side, playerA, playerB) {
  return side === "a" ? playerA.display_name : playerB.display_name;
}

function resetPointState() {
  state.game.phase = "serve";
  state.game.isSecondServe = false;
  state.game.activeSide = null;
  state.game.positions = { a: "baseline", b: "baseline" };
  state.game.rallyCount = 0;
  state.game.rallyPressure = 0;
  state.game.currentPointLog = [];
  state.game.lastPointWinner = null;
  state.game.lastPointText = "";
}

function logPoint(text) {
  state.game.currentPointLog.push(text);
}

function completePoint(winnerSide, text) {
  const game = state.game;
  if (winnerSide === "a") game.scoreA += 1;
  else game.scoreB += 1;

  game.lastPointWinner = winnerSide;
  game.lastPointText = text;
  const summary = `${getSidePlayer(winnerSide).display_name}: ${text}`;
  game.matchLog.push({
    winner_side: winnerSide,
    winner_name: getSidePlayer(winnerSide).display_name,
    summary,
    scoreA: game.scoreA,
    scoreB: game.scoreB,
    actions: [...game.currentPointLog],
    created_at: nowIso()
  });

  game.phase = isMatchOver() ? "matchOver" : "pointResult";
}

function playServe() {
  const serve = findServe(document.getElementById("serveType").value);
  const read = findServe(document.getElementById("returnRead").value);
  const serveRisk = Number(document.getElementById("serveRisk").value);
  const returnRisk = Number(document.getElementById("returnRisk").value);
  const game = state.game;
  const serverSide = getServerSideForPoint();
  const returnerSide = otherSide(serverSide);
  const fit = matchFit(serve, read);
  const firstOrSecond = game.isSecondServe ? "2. Aufschlag" : "1. Aufschlag";

  const faultChance = clamp(serve.fault + riskErrorTerm(serveRisk, 0.34, 0.04) + (game.isSecondServe ? 0.02 : 0), 0.02, 0.74);
  logPoint(`${firstOrSecond}: ${getSidePlayer(serverSide).display_name} wählt ${serve.label} mit ${serveRisk}% Risiko. ${getSidePlayer(returnerSide).display_name} stellt sich auf ${read.label} ein. Lesewert: ${asPercent(fit)}.`);

  if (Math.random() < faultChance) {
    if (!game.isSecondServe) {
      game.isSecondServe = true;
      logPoint(`Fehler beim ersten Aufschlag. Geschätzte Fehlerchance lag bei ${asPercent(faultChance)}.`);
      render();
      return;
    }
    logPoint(`Doppelfehler. Geschätzte Fehlerchance beim zweiten Aufschlag lag bei ${asPercent(faultChance)}.`);
    completePoint(returnerSide, `${getSidePlayer(serverSide).display_name} riskiert zu viel: Doppelfehler.`);
    render();
    return;
  }

  const servePressure = serve.power * (0.62 + riskPowerTerm(serveRisk) * 0.58);
  const aceChance = clamp(0.006 + serve.ace * riskPowerTerm(serveRisk) + (1 - fit) * 0.082 + Math.max(0, serveRisk - 100) * 0.0015, 0.005, 0.34);
  const returnErrorChance = clamp(0.045 + servePressure * 0.18 + (1 - fit) * 0.22 - fit * 0.075 + Math.max(0, returnRisk - 100) * 0.0032, 0.015, 0.72);
  const returnWinnerChance = clamp(0.006 + fit * 0.105 + Math.max(0, returnRisk - 100) * 0.0026 - servePressure * 0.035, 0.004, 0.32);
  const roll = Math.random();

  if (roll < aceChance) {
    logPoint(`Ass / Service-Winner. Der Returner war falsch eingestellt. Ass-Chance: ${asPercent(aceChance)}.`);
    completePoint(serverSide, `${getSidePlayer(serverSide).display_name} serviert den Ball weg.`);
    render();
    return;
  }

  if (roll < aceChance + returnWinnerChance) {
    logPoint(`Perfekter Return. Return-Winner-Chance: ${asPercent(returnWinnerChance)}.`);
    completePoint(returnerSide, `${getSidePlayer(returnerSide).display_name} liest den Aufschlag perfekt und schlägt den Return-Winner.`);
    render();
    return;
  }

  if (roll < aceChance + returnWinnerChance + returnErrorChance) {
    logPoint(`Returnfehler unter Druck. Returnfehler-Chance: ${asPercent(returnErrorChance)}.`);
    completePoint(serverSide, `${getSidePlayer(returnerSide).display_name} bekommt den Return nicht kontrolliert.`);
    render();
    return;
  }

  const returnQuality = fit > 0.85 ? "stark" : fit > 0.45 ? "neutral" : "schwach";
  game.phase = "rally";
  game.activeSide = serverSide;
  game.positions = { a: "baseline", b: "baseline" };
  game.rallyCount = 0;
  game.rallyPressure = returnQuality === "stark" ? 0.08 : returnQuality === "schwach" ? -0.035 : 0;
  logPoint(`Return im Feld. Qualität: ${returnQuality}. Der Ballwechsel startet.`);
  render();
}

function playRally() {
  const game = state.game;
  const activeSide = game.activeSide;
  const defenderSide = otherSide(activeSide);
  const shot = findShot(document.getElementById("rallyShot").value, activeSide);
  const expectedShot = availableShotsFor(activeSide).find(s => s.id === document.getElementById("rallyRead").value) || shot;
  const shotRisk = Number(document.getElementById("shotRisk").value);
  const defenseRisk = Number(document.getElementById("defenseRisk").value);
  const fit = matchFit(shot, expectedShot);
  const fatigue = clamp(game.rallyCount * 0.018, 0, 0.22);
  const pressurePenalty = clamp(game.rallyPressure, -0.05, 0.12);

  const errorChance = clamp(shot.error + riskErrorTerm(shotRisk, 0.24, 0.04) + fatigue + pressurePenalty - fit * 0.025, 0.015, 0.76);
  const winnerChance = clamp(shot.winner + riskPowerTerm(shotRisk) * 0.06 + (1 - fit) * 0.13 + Math.max(0, defenseRisk - 100) * 0.0014, 0.005, 0.42);
  const forcedErrorChance = clamp(shot.force + riskPowerTerm(shotRisk) * 0.055 + (1 - fit) * 0.11 - fit * 0.06 + fatigue * 0.28, 0.01, 0.48);

  logPoint(`${getSidePlayer(activeSide).display_name}: ${shot.label} mit ${shotRisk}% Risiko. ${getSidePlayer(defenderSide).display_name} erwartet ${expectedShot.label}. Lesewert: ${asPercent(fit)}. Rally-Länge: ${game.rallyCount + 1}.`);

  const roll = Math.random();
  if (roll < errorChance) {
    logPoint(`Fehler durch Risiko/Länge. Fehlerchance: ${asPercent(errorChance)}.`);
    completePoint(defenderSide, `${getSidePlayer(activeSide).display_name} verzieht ${shot.label}.`);
    render();
    return;
  }

  if (roll < errorChance + winnerChance) {
    logPoint(`Winner. Winner-Chance: ${asPercent(winnerChance)}.`);
    completePoint(activeSide, `${getSidePlayer(activeSide).display_name} trifft ${shot.label} perfekt.`);
    render();
    return;
  }

  if (roll < errorChance + winnerChance + forcedErrorChance) {
    logPoint(`Erzwungener Fehler. Chance: ${asPercent(forcedErrorChance)}.`);
    completePoint(activeSide, `${getSidePlayer(activeSide).display_name} setzt den Gegner mit ${shot.label} entscheidend unter Druck.`);
    render();
    return;
  }

  if (shot.approach) {
    game.positions[activeSide] = "net";
    logPoint(`${getSidePlayer(activeSide).display_name} rückt ans Netz vor.`);
  }
  if (["lob", "passing_cross", "passing_line", "topspin_hard"].includes(shot.id) && game.positions[defenderSide] === "net") {
    game.positions[defenderSide] = Math.random() < 0.38 ? "baseline" : "net";
  }

  game.rallyCount += 1;
  game.activeSide = defenderSide;
  game.rallyPressure = fit > 0.80 ? -0.02 : (1 - fit) * 0.035;
  logPoint(`${getSidePlayer(defenderSide).display_name} bekommt den Ball zurück. Der Ballwechsel läuft weiter.`);
  render();
}

async function saveMatch() {
  const game = state.game;
  const winnerSide = getMatchWinnerSide();
  const winner = getSidePlayer(winnerSide);
  const payload = {
    challengeId: state.selectedChallenge?.id || null,
    playerAId: game.playerA.id,
    playerBId: game.playerB.id,
    winnerId: winner.id,
    scoreA: game.scoreA,
    scoreB: game.scoreB,
    matchLog: game.matchLog
  };

  await state.store.submitMatch(payload);
  await refreshLobby(false);
  showToast("Ergebnis gespeichert. Rangliste wurde aktualisiert.");
  state.game = null;
  state.selectedChallenge = null;
  state.view = "lobby";
  render();
}

function findPlayer(playerId) {
  return (state.lobby?.players || []).find(p => p.id === playerId);
}

function findChallenge(challengeId) {
  return (state.lobby?.challenges || []).find(c => c.id === challengeId);
}

async function safeAction(callback) {
  try {
    await callback();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Aktion fehlgeschlagen.");
  }
}

app.addEventListener("input", event => {
  if (event.target.matches("input[type='range'][data-range-label]")) {
    const label = document.getElementById(event.target.dataset.rangeLabel);
    if (label) label.textContent = `${event.target.value}%`;
  }
});

app.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;

  if (form.id === "loginForm") {
    safeAction(async () => {
      const session = await state.store.loginPlayer(
        document.getElementById("loginName").value,
        document.getElementById("loginPin").value
      );
      saveSession(session);
      await refreshLobby(false);
      state.view = "lobby";
      render();
      showToast("Angemeldet.");
    });
  }

  if (form.id === "registerForm") {
    safeAction(async () => {
      const session = await state.store.registerPlayer(
        document.getElementById("registerName").value,
        document.getElementById("registerPin").value
      );
      saveSession(session);
      await refreshLobby(false);
      state.view = "lobby";
      render();
      showToast("Spieler erstellt und angemeldet.");
    });
  }
});

app.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const playerId = button.dataset.playerId;
  const challengeId = button.dataset.challengeId;

  safeAction(async () => {
    if (action === "refresh" || action === "refresh-public") {
      await refreshLobby(true);
      render();
    }

    if (action === "logout") {
      clearSession();
      state.view = "setup";
      render();
      showToast("Abgemeldet.");
    }

    if (action === "challenge") {
      await state.store.createChallenge(playerId);
      await refreshLobby(false);
      render();
      showToast("Forderung erstellt.");
    }

    if (action === "accept") {
      await state.store.acceptChallenge(challengeId);
      await refreshLobby(false);
      render();
      showToast("Forderung angenommen.");
    }

    if (action === "cancel") {
      await state.store.cancelChallenge(challengeId);
      await refreshLobby(false);
      render();
      showToast("Forderung abgebrochen.");
    }

    if (action === "play-challenge") {
      const challenge = findChallenge(challengeId);
      if (!challenge) throw new Error("Forderung nicht gefunden.");
      const playerA = findPlayer(challenge.challenger_id);
      const playerB = findPlayer(challenge.challenged_id);
      startGame(playerA, playerB, challenge);
    }

    if (action === "direct-match") {
      const current = findPlayer(state.session.player.id) || state.session.player;
      const opponent = findPlayer(playerId);
      if (!opponent) throw new Error("Gegner nicht gefunden.");
      startGame(current, opponent, null);
    }

    if (action === "play-serve") playServe();
    if (action === "play-rally") playRally();

    if (action === "next-point") {
      resetPointState();
      render();
    }

    if (action === "save-match") {
      await saveMatch();
    }

    if (action === "back-lobby") {
      state.game = null;
      state.selectedChallenge = null;
      state.view = "lobby";
      await refreshLobby(false);
      render();
    }

    if (action === "reset-demo") {
      localStorage.removeItem(STORAGE_DEMO_KEY);
      clearSession();
      state.store = new DemoStore();
      await refreshLobby(false);
      state.view = "setup";
      render();
      showToast("Demo-Daten zurückgesetzt.");
    }
  });
});

init().catch(error => {
  console.error(error);
  setConnectionBadge("error", "Fehler");
  app.innerHTML = `
    <section class="card">
      <h2>Start fehlgeschlagen</h2>
      <p class="muted">${escapeHtml(error.message || "Unbekannter Fehler")}</p>
    </section>`;
});
