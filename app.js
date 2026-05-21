const VERSION = "0.3.0";
const STORAGE_SESSION_KEY = "tennis_ladder_session_v021";
const WIN_POINTS = 3;
const TURN_SECONDS = 5 * 60;

const SERVES = [
  { id: "slice_wide", label: "Slice außen", family: "slice", zone: "wide" },
  { id: "slice_middle", label: "Slice Mitte", family: "slice", zone: "middle" },
  { id: "kick_middle", label: "Kick Mitte", family: "kick", zone: "middle" },
  { id: "kick_body", label: "Kick auf Körper", family: "kick", zone: "body" },
  { id: "flat_t", label: "Glatt durch die Mitte", family: "flat", zone: "middle" },
  { id: "body", label: "Hart auf Körper", family: "flat", zone: "body" }
];

const BASELINE_SHOTS = [
  { id: "topspin_cross", label: "Topspin cross" },
  { id: "topspin_line", label: "Topspin longline" },
  { id: "slice_short", label: "Slice kurz" },
  { id: "drop_shot", label: "Stoppball" },
  { id: "lob", label: "Lob" },
  { id: "approach_net", label: "Angriff ans Netz" }
];

const NET_SHOTS = [
  { id: "volley", label: "Volley wegdrücken" },
  { id: "stop_volley", label: "Stopp-Volley" },
  { id: "smash", label: "Smash" }
];

const PASSING_SHOTS = [
  { id: "passing_cross", label: "Passierball cross" },
  { id: "passing_line", label: "Passierball longline" },
  { id: "lob", label: "Lob über Netzspieler" },
  { id: "topspin_hard", label: "Hart auf die Füße" }
];

const app = document.getElementById("app");
const toastHost = document.getElementById("toastHost");
const connectionBadge = document.getElementById("connectionBadge");
const versionBadge = document.getElementById("versionBadge");

const state = {
  store: null,
  session: null,
  lobby: null,
  liveMatch: null,
  view: "loading",
  pollTimer: null,
  tickTimer: null,
  lastLobbyRenderAt: 0
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

function normalizePlayer(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    display_name: raw.display_name || raw.name,
    rank_position: raw.rank_position == null ? null : Number(raw.rank_position || raw.rank || 0),
    wins: Number(raw.wins || 0),
    losses: Number(raw.losses || 0),
    points_for: Number(raw.points_for || 0),
    points_against: Number(raw.points_against || 0),
    is_approved: Boolean(raw.is_approved),
    is_admin: Boolean(raw.is_admin),
    can_challenge: raw.can_challenge === undefined ? null : Boolean(raw.can_challenge),
    challenge_block_reason: raw.challenge_block_reason || "",
    max_challenge_jump: raw.max_challenge_jump == null ? null : Number(raw.max_challenge_jump),
    quick_match_allowed: raw.quick_match_allowed === undefined ? null : Boolean(raw.quick_match_allowed)
  };
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
    declined: "abgelehnt",
    active: "läuft",
    forfeited: "Timeout"
  };
  return labels[status] || status;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function secondsRemaining(deadline) {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
}

function formatSeconds(seconds) {
  if (seconds === null || Number.isNaN(seconds)) return "-";
  const value = Math.max(0, Number(seconds));
  const min = Math.floor(value / 60);
  const sec = value % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function findServe(id) {
  return SERVES.find(item => item.id === id) || SERVES[0];
}

function findShot(id, shots) {
  return shots.find(item => item.id === id) || shots[0];
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

  async approvePlayer(playerId) {
    const { data, error } = await this.client.rpc("approve_player", {
      p_session_token: state.session?.token,
      p_player_id: playerId
    });
    if (error) throw error;
    return normalizePlayer(data);
  }

  async rejectPlayer(playerId) {
    const { data, error } = await this.client.rpc("reject_player", {
      p_session_token: state.session?.token,
      p_player_id: playerId
    });
    if (error) throw error;
    return data;
  }

  async startLiveMatch({ opponentId = null, challengeId = null }) {
    const { data, error } = await this.client.rpc("start_live_match", {
      p_session_token: state.session?.token,
      p_opponent_id: opponentId,
      p_challenge_id: challengeId
    });
    if (error) throw error;
    return this.normalizeLiveMatch(data);
  }

  async startQuickMatch(opponentId) {
    return this.startLiveMatch({ opponentId, challengeId: null });
  }

  async getLiveMatch(matchId) {
    const { data, error } = await this.client.rpc("get_live_match", {
      p_session_token: state.session?.token,
      p_live_match_id: matchId
    });
    if (error) throw error;
    return this.normalizeLiveMatch(data);
  }

  async submitLiveChoice(matchId, choice) {
    const { data, error } = await this.client.rpc("submit_live_choice", {
      p_session_token: state.session?.token,
      p_live_match_id: matchId,
      p_choice: choice
    });
    if (error) throw error;
    return this.normalizeLiveMatch(data);
  }

  async continueLiveMatch(matchId) {
    const { data, error } = await this.client.rpc("continue_live_match", {
      p_session_token: state.session?.token,
      p_live_match_id: matchId
    });
    if (error) throw error;
    return this.normalizeLiveMatch(data);
  }

  async claimLiveTimeout(matchId) {
    const { data, error } = await this.client.rpc("claim_live_timeout", {
      p_session_token: state.session?.token,
      p_live_match_id: matchId
    });
    if (error) throw error;
    return this.normalizeLiveMatch(data);
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
      current_player: normalizePlayer(payload.current_player),
      pending_players: (payload.pending_players || []).map(normalizePlayer),
      challenges: payload.challenges || [],
      recent_matches: payload.recent_matches || [],
      live_matches: payload.live_matches || [],
      rules: payload.rules || {}
    };
  }

  normalizeLiveMatch(data) {
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    return {
      ...payload,
      player_a: normalizePlayer(payload.player_a),
      player_b: normalizePlayer(payload.player_b),
      score_a: Number(payload.score_a || 0),
      score_b: Number(payload.score_b || 0),
      match_type: payload.match_type || "ranked",
      rally_count: Number(payload.rally_count || 0),
      point_log: payload.point_log || [],
      match_log: payload.match_log || [],
      seconds_remaining: Number(payload.seconds_remaining ?? secondsRemaining(payload.action_deadline) ?? 0),
      can_claim_timeout: Boolean(payload.can_claim_timeout)
    };
  }
}

async function init() {
  const config = window.TENNIS_CONFIG || {};
  const hasRemoteConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);

  if (!hasRemoteConfig) {
    state.store = null;
    state.view = "configError";
    setConnectionBadge("error", "Supabase fehlt");
    render();
    return;
  }

  state.store = new RemoteStore(config.supabaseUrl, config.supabaseAnonKey);
  setConnectionBadge("ok", "Supabase aktiv");

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
  startPolling();
  startCountdownTicks();
  render();
}

function startPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    safeAction(async () => {
      if (state.view === "live" && state.liveMatch?.id) {
        const currentId = state.session?.player?.id;
        const shouldPoll = state.liveMatch.waiting_for_player_id !== currentId || state.liveMatch.phase === "match_over";
        if (shouldPoll) {
          state.liveMatch = await state.store.getLiveMatch(state.liveMatch.id);
          render();
        }
        return;
      }

      if (state.view === "lobby" && state.session) {
        await refreshLobby(false);
        state.lastLobbyRenderAt = Date.now();
        render();
      }
    }, { silent: true });
  }, 2500);
}

function startCountdownTicks() {
  if (state.tickTimer) window.clearInterval(state.tickTimer);
  state.tickTimer = window.setInterval(() => {
    const node = document.getElementById("deadlineCountdown");
    if (!node || !state.liveMatch?.action_deadline) return;
    node.textContent = formatSeconds(secondsRemaining(state.liveMatch.action_deadline));
  }, 1000);
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
  state.liveMatch = null;
  localStorage.removeItem(STORAGE_SESSION_KEY);
}

function render() {
  if (state.view === "configError") return renderConfigError();
  if (state.view === "setup") return renderSetup();
  if (state.view === "lobby") return renderLobby();
  if (state.view === "live") return renderLiveMatch();
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

function renderConfigError() {
  app.innerHTML = `
    <section class="card">
      <h2>Supabase-Konfiguration fehlt</h2>
      <p class="muted">Diese Version nutzt keine lokalen Demo-Daten. Prüfe die Datei <strong>config.js</strong> im GitHub-Repository.</p>
      <div class="notice small">
        In <strong>config.js</strong> müssen <strong>supabaseUrl</strong> und <strong>supabaseAnonKey</strong> gefüllt sein. Lade beim Update keine leere config.js hoch.
      </div>
      <pre><code>window.TENNIS_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseAnonKey: "DEIN-PUBLISHABLE-ODER-ANON-KEY"
};</code></pre>
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
              <p class="muted">Öffentlich sichtbar. Zum Fordern bitte anmelden und vom Admin freigeschaltet sein.</p>
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
          </div>
          <div class="success small">Supabase ist aktiv. Neue Spieler müssen nach der Registrierung vom Admin freigegeben werden.</div>
          <div class="setup-columns" style="margin-top: 16px;">
            <form id="loginForm" class="card compact form-grid">
              <h3>Login</h3>
              <label class="field"><span>Spielername</span><input id="loginName" autocomplete="username" placeholder="z. B. Stefan" required /></label>
              <label class="field"><span>PIN</span><input id="loginPin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="1234" required /></label>
              <button class="btn primary" type="submit">Einloggen</button>
            </form>
            <form id="registerForm" class="card compact form-grid">
              <h3>Freigabe anfragen</h3>
              <label class="field"><span>Spielername</span><input id="registerName" autocomplete="username" placeholder="Name" required /></label>
              <label class="field"><span>4-stellige PIN</span><input id="registerPin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="0000" required /></label>
              <button class="btn" type="submit">Registrieren und Freigabe anfragen</button>
            </form>
          </div>
        </div>
      </div>
      <aside class="grid">
        <div class="card compact">
          <h2>Regelstand v${VERSION}</h2>
          <ul class="log-list small">
            <li class="log-item"><strong>Rangliste:</strong> Forderungen sind begrenzt: Top 3 nur 1 Platz, Top 10 maximal 2 Plätze, danach maximal 5 Plätze nach oben.</li>
            <li class="log-item"><strong>Kurzspiel:</strong> Direktes Live-Spiel ohne Ranglisten- oder Statistikänderung.</li>
            <li class="log-item"><strong>Timeout:</strong> Pro Eingabe laufen ${TURN_SECONDS / 60} Minuten. Danach kann der Gegner Timeout-Sieg reklamieren.</li>
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
  const current = state.lobby?.current_player || players.find(p => p.id === currentId) || state.session?.player;
  const challenges = state.lobby?.challenges || [];
  const recentMatches = state.lobby?.recent_matches || [];
  const liveMatches = state.lobby?.live_matches || [];
  const pendingPlayers = state.lobby?.pending_players || [];
  const isApproved = Boolean(current?.is_approved);
  const isAdmin = Boolean(current?.is_admin);

  if (!isApproved) {
    app.innerHTML = `
      <section class="grid two">
        <div class="grid">
          <div class="card">
            <div class="card-title-row">
              <div>
                <h2>Freigabe ausstehend</h2>
                <p class="muted">Angemeldet als <strong>${escapeHtml(current?.display_name || "?")}</strong>. Dieses Konto ist noch nicht vom Admin freigegeben.</p>
              </div>
              <div class="btn-row">
                <button class="btn ghost" data-action="refresh">Aktualisieren</button>
                <button class="btn ghost" data-action="logout">Abmelden</button>
              </div>
            </div>
            <div class="notice small">Du kannst die öffentliche Rangliste sehen, aber noch keine Forderungen erstellen oder Live-Spiele starten.</div>
          </div>
          <div class="card">
            <div class="card-title-row">
              <div>
                <h2>Rangliste</h2>
                <p class="muted">Nur freigegebene Spieler erscheinen in der Tabelle.</p>
              </div>
            </div>
            ${renderRankingTable(players, null, { showActions: false })}
          </div>
        </div>
        <aside class="grid">
          <div class="card compact">
            <h2>Status</h2>
            <p class="muted small">Warte auf Admin-Freigabe. Nach der Freigabe bitte aktualisieren oder neu einloggen.</p>
          </div>
          <div class="card compact">
            <h2>Letzte Matches</h2>
            ${renderRecentMatches(recentMatches)}
          </div>
        </aside>
      </section>`;
    return;
  }

  app.innerHTML = `
    <section class="grid two">
      <div class="grid">
        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Rangliste</h2>
              <p class="muted">Angemeldet als <strong>${escapeHtml(current?.display_name || "?")}</strong>${isAdmin ? ` <span class="pill">Admin</span>` : ""}. Forderungen sind ranglistenrelevant.</p>
            </div>
            <div class="btn-row">
              <button class="btn ghost" data-action="refresh">Aktualisieren</button>
              <button class="btn ghost" data-action="logout">Abmelden</button>
            </div>
          </div>
          ${renderRankingTable(players, currentId)}
        </div>

        ${isAdmin ? renderAdminPanel(pendingPlayers) : ""}

        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Live-Spiele</h2>
              <p class="muted">Laufende Matches, bei denen du beteiligt bist.</p>
            </div>
          </div>
          ${renderLiveMatches(liveMatches, currentId)}
        </div>

        <div class="card">
          <div class="card-title-row">
            <div>
              <h2>Forderungen</h2>
              <p class="muted">Nach Annahme kann daraus ein echtes Zwei-Geräte-Live-Spiel gestartet werden.</p>
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
          <h2>Aktuelle Regeln</h2>
          <ul class="log-list small">
            <li class="log-item"><strong>Gewinn:</strong> erster Spieler mit ${WIN_POINTS} Punkten.</li>
            <li class="log-item"><strong>Fordern:</strong> Top 3 nur direkt davor, Top 10 maximal 2 Plätze, danach maximal 5 Plätze nach oben.</li>
            <li class="log-item"><strong>Sperre:</strong> pro Spieler nur eine aktive Forderung oder ein laufendes Live-Spiel.</li>
            <li class="log-item"><strong>Ablauf:</strong> offene Forderung 24 Stunden, angenommene Forderung 30 Minuten bis Spielstart.</li>
            <li class="log-item"><strong>Kurzspiel:</strong> zählt nicht für Rangliste und Statistik.</li>
          </ul>
        </div>
        <div class="card compact">
          <h2>Letzte Matches</h2>
          ${renderRecentMatches(recentMatches)}
        </div>
      </aside>
    </section>`;
}

function renderAdminPanel(pendingPlayers) {
  return `
    <div class="card">
      <div class="card-title-row">
        <div>
          <h2>Admin: Spieler-Freigaben</h2>
          <p class="muted">Neue Registrierungen erscheinen erst nach Freigabe in der Rangliste.</p>
        </div>
        <span class="pill">${pendingPlayers.length} offen</span>
      </div>
      ${!pendingPlayers.length ? `<p class="muted">Keine offenen Freigaben.</p>` : `
        <ul class="challenge-list">
          ${pendingPlayers.map(player => `
            <li class="challenge-item">
              <div class="challenge-title">
                <span>${escapeHtml(player.display_name)}</span>
                <span class="status open">wartet</span>
              </div>
              <p class="muted small">Noch nicht in der Rangliste. Freigabe hängt ihn hinten an.</p>
              <div class="btn-row">
                <button class="btn primary" data-action="approve-player" data-player-id="${player.id}">Freigeben</button>
                <button class="btn danger" data-action="reject-player" data-player-id="${player.id}">Ablehnen/löschen</button>
              </div>
            </li>`).join("")}
        </ul>`}
    </div>`;
}

function renderRankingTable(players, currentId, options = {}) {
  const showActions = options.showActions !== false;
  const rows = players.map(player => {
    const isSelf = player.id === currentId;
    const canChallenge = player.can_challenge === true;
    const challengeReason = player.challenge_block_reason || "Forderung aktuell nicht möglich.";
    return `
      <tr>
        <td><span class="rank">${player.rank_position ?? "-"}</span></td>
        <td><strong>${escapeHtml(player.display_name)}</strong>${isSelf ? ` <span class="pill">du</span>` : ""}</td>
        <td>${player.wins}</td>
        <td>${player.losses}</td>
        <td>${player.points_for}:${player.points_against}</td>
        <td>
          ${!showActions ? `<span class="muted small">Login nötig</span>` : isSelf ? `<span class="muted small">-</span>` : `
            <div class="btn-row">
              <button class="btn primary" data-action="challenge" data-player-id="${player.id}" ${canChallenge ? "" : "disabled"} title="${escapeHtml(challengeReason)}">Fordern</button>
              <button class="btn" data-action="quick-match" data-player-id="${player.id}">Kurzspiel</button>
            </div>
            ${canChallenge ? "" : `<div class="muted small">${escapeHtml(challengeReason)}</div>`}`}
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

function renderLiveMatches(liveMatches, currentId) {
  if (!liveMatches.length) return `<p class="muted">Keine laufenden Live-Spiele.</p>`;

  return `
    <ul class="challenge-list">
      ${liveMatches.map(match => {
        const opponent = match.player_a_id === currentId ? match.player_b_name : match.player_a_name;
        const myTurn = match.waiting_for_player_id === currentId;
        return `
          <li class="challenge-item">
            <div class="challenge-title">
              <span>${escapeHtml(match.player_a_name)} ${match.score_a}:${match.score_b} ${escapeHtml(match.player_b_name)}</span>
              <span class="status ${match.status}">${match.match_type === "quick" ? "Kurzspiel" : "Rangliste"} · ${myTurn ? "du bist dran" : statusLabel(match.status)}</span>
            </div>
            <p class="muted small">Gegner: ${escapeHtml(opponent)} · Phase: ${escapeHtml(phaseLabel(match.phase))} · aktualisiert: ${formatDate(match.updated_at)}</p>
            <button class="btn primary" data-action="open-live" data-live-match-id="${match.id}">${myTurn ? "Jetzt spielen" : "Zum Spiel"}</button>
          </li>`;
      }).join("")}
    </ul>`;
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
        return `
          <li class="challenge-item">
            <div class="challenge-title">
              <span>#${challenge.challenger_rank || "?"} ${escapeHtml(challenge.challenger_name)} fordert #${challenge.challenged_rank || "?"} ${escapeHtml(challenge.challenged_name)}</span>
              <span class="status ${challenge.status}">${statusLabel(challenge.status)}</span>
            </div>
            <p class="muted small">Erstellt: ${formatDate(challenge.created_at)}${challenge.accepted_at ? ` · angenommen: ${formatDate(challenge.accepted_at)}` : ""}${challenge.expires_at && ["open", "accepted"].includes(challenge.status) ? ` · läuft ab: ${formatDate(challenge.expires_at)}` : ""}</p>
            <div class="btn-row">
              ${challenge.active_live_match_id ? `<button class="btn primary" data-action="open-live" data-live-match-id="${challenge.active_live_match_id}">Zum Live-Spiel</button>` : ""}
              ${canAccept ? `<button class="btn primary" data-action="accept" data-challenge-id="${challenge.id}">Annehmen</button>` : ""}
              ${canPlay && !challenge.active_live_match_id ? `<button class="btn primary" data-action="start-challenge-live" data-challenge-id="${challenge.id}">Live-Spiel starten</button>` : ""}
              ${canCancel ? `<button class="btn danger" data-action="cancel" data-challenge-id="${challenge.id}">Abbrechen</button>` : ""}
            </div>
          </li>`;
      }).join("")}
    </ul>`;
}

function renderRecentMatches(matches) {
  if (!matches.length) return `<p class="muted small">Noch keine Matches gespeichert.</p>`;
  return `
    <ul class="log-list small">
      ${matches.map(match => `
        <li class="log-item">
          <strong>${escapeHtml(match.winner_name)} gewinnt</strong> <span class="pill">${match.match_type === "quick" ? "Kurzspiel" : "Rangliste"}</span><br>
          ${escapeHtml(match.player_a_name)} ${match.score_a}:${match.score_b} ${escapeHtml(match.player_b_name)}<br>
          <span class="muted">${formatDate(match.completed_at)}</span>
        </li>`).join("")}
    </ul>`;
}

function renderLiveMatch() {
  const match = state.liveMatch;
  if (!match) {
    state.view = "lobby";
    return renderLobby();
  }

  const currentId = state.session?.player?.id;
  const opponent = match.player_a.id === currentId ? match.player_b : match.player_a;
  const waitingPlayer = getLivePlayer(match.waiting_for_player_id);

  app.innerHTML = `
    <section class="grid">
      <div class="card">
        <div class="card-title-row">
          <div>
            <h2>${match.match_type === "quick" ? "Kurzspiel" : "Ranglistenspiel"}</h2>
            <p class="muted">Du spielst gegen <strong>${escapeHtml(opponent?.display_name || "?")}</strong>. ${match.match_type === "quick" ? "Dieses Spiel ändert keine Rangliste und keine Statistik." : "Dieses Spiel zählt für die Rangliste."} Erster Spieler mit ${WIN_POINTS} Punkten gewinnt.</p>
          </div>
          <div class="btn-row">
            <button class="btn ghost" data-action="refresh-live">Aktualisieren</button>
            <button class="btn ghost" data-action="back-lobby">Zur Rangliste</button>
          </div>
        </div>
        ${renderLiveScoreboard(match)}
        <div class="phase-panel">${renderLivePhase(match, currentId, waitingPlayer)}</div>
      </div>
      <div class="grid two">
        <div class="card compact">
          <h2>Punkt-Protokoll</h2>
          ${renderPointLog(match.point_log)}
        </div>
        <div class="card compact">
          <h2>Match-Log</h2>
          ${renderMatchLog(match.match_log)}
        </div>
      </div>
    </section>`;
  syncRangeLabels();
}

function renderLiveScoreboard(match) {
  return `
    <div class="scoreboard">
      <div class="score-player ${match.waiting_for_player_id === match.player_a.id ? "active" : ""}">
        <div class="score-name">${escapeHtml(match.player_a.display_name)}${match.point_server_id === match.player_a.id ? " · Aufschlag" : ""}</div>
        <div class="score-number">${match.score_a}</div>
      </div>
      <div class="score-middle">
        <span class="pill">${match.match_type === "quick" ? "Kurzspiel" : "Rangliste"}</span>
        <span class="small">${escapeHtml(phaseLabel(match.phase))} · Sieg bei ${WIN_POINTS} Punkten</span>
      </div>
      <div class="score-player ${match.waiting_for_player_id === match.player_b.id ? "active" : ""}">
        <div class="score-name">${escapeHtml(match.player_b.display_name)}${match.point_server_id === match.player_b.id ? " · Aufschlag" : ""}</div>
        <div class="score-number">${match.score_b}</div>
      </div>
    </div>`;
}

function renderLivePhase(match, currentId, waitingPlayer) {
  if (match.phase === "match_over" || match.status === "completed" || match.status === "forfeited") {
    const winner = getLivePlayer(match.last_point_winner_id) || (match.score_a > match.score_b ? match.player_a : match.player_b);
    return `
      <div class="choice-card">
        <p class="point-text">Match beendet: ${escapeHtml(winner?.display_name || "?")} gewinnt ${match.score_a}:${match.score_b}.</p>
        <p class="muted">${match.status === "forfeited" ? "Das Match wurde durch Timeout entschieden." : match.match_type === "quick" ? "Das Ergebnis wurde als Kurzspiel gespeichert. Die Rangliste bleibt unverändert." : "Das Ergebnis wurde gespeichert und die Rangliste aktualisiert."}</p>
        <button class="btn primary" data-action="back-lobby">Zur Rangliste</button>
      </div>`;
  }

  if (match.phase === "point_result") {
    return `
      <div class="choice-card">
        <p class="point-text">${escapeHtml(match.last_point_text || "Punkt entschieden.")}</p>
        <p class="muted">Jeder beteiligte Spieler kann den nächsten Punkt starten.</p>
        <button class="btn primary" data-action="continue-live">Nächster Punkt</button>
      </div>`;
  }

  const isMyTurn = match.waiting_for_player_id === currentId;
  if (!isMyTurn) {
    const remaining = secondsRemaining(match.action_deadline);
    return `
      <div class="choice-card">
        <h3>Warten auf ${escapeHtml(waitingPlayer?.display_name || "Gegner")}</h3>
        <p class="muted">Sobald der andere Spieler seine Eingabe gemacht hat, aktualisiert sich das Spiel automatisch.</p>
        <p><span class="pill ${remaining <= 0 ? "danger" : ""}">Restzeit: <strong id="deadlineCountdown">${formatSeconds(remaining)}</strong></span></p>
        <div class="btn-row">
          <button class="btn ghost" data-action="refresh-live">Aktualisieren</button>
          ${match.can_claim_timeout ? `<button class="btn danger" data-action="claim-timeout">Timeout-Sieg reklamieren</button>` : ""}
        </div>
      </div>`;
  }

  if (match.phase === "serve_attack") return renderServeAttack(match);
  if (match.phase === "serve_read") return renderServeRead(match);
  if (match.phase === "rally_attack") return renderRallyAttack(match);
  if (match.phase === "rally_read") return renderRallyRead(match);
  return `<p>Unbekannte Phase.</p>`;
}

function renderServeAttack(match) {
  const title = match.is_second_serve ? "Zweiter Aufschlag" : "Erster Aufschlag";
  return `
    <div class="choice-card form-grid">
      <h3>${escapeHtml(getLivePlayer(match.waiting_for_player_id)?.display_name || "Du")} · ${title}</h3>
      <p class="muted small">Deine Auswahl wird verdeckt gespeichert. Der Gegner sieht erst nach seiner Return-Einstellung, was du gespielt hast.</p>
      <label class="field"><span>Aufschlag wählen</span><select id="serveType">${SERVES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select></label>
      ${renderRiskField("serveRisk", 92)}
      <button class="btn primary" data-action="submit-serve">Aufschlag verdeckt wählen</button>
    </div>`;
}

function renderServeRead(match) {
  return `
    <div class="choice-card form-grid">
      <h3>Return einstellen</h3>
      <p class="muted small">Der Aufschlag wurde verdeckt gewählt. Je genauer du ihn liest, desto besser werden Return und Konterchance.</p>
      <label class="field"><span>Worauf stellst du dich ein?</span><select id="returnRead">${SERVES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select></label>
      ${renderRiskField("returnRisk", 82)}
      <button class="btn primary" data-action="submit-return-read">Return spielen</button>
    </div>`;
}

function renderRallyAttack(match) {
  const activeSide = sideOf(match, match.active_player_id);
  const shots = availableShotsForLive(match, activeSide);
  return `
    <div class="choice-card form-grid">
      <h3>${escapeHtml(getLivePlayer(match.active_player_id)?.display_name || "Du")} · Schlag ${match.rally_count + 1}</h3>
      <p class="muted small">Position: ${match.positions?.[activeSide] === "net" ? "am Netz" : "Grundlinie"}. Die Auswahl bleibt verdeckt, bis der Gegner gelesen hat.</p>
      <label class="field"><span>Schlag wählen</span><select id="rallyShot">${shots.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select></label>
      ${renderRiskField("shotRisk", 88)}
      <button class="btn primary" data-action="submit-rally-shot">Schlag verdeckt wählen</button>
    </div>`;
}

function renderRallyRead(match) {
  const activeSide = sideOf(match, match.active_player_id);
  const shots = availableShotsForLive(match, activeSide);
  return `
    <div class="choice-card form-grid">
      <h3>Gegnerschlag lesen</h3>
      <p class="muted small">Der Gegner hat einen Schlag verdeckt gewählt. Du stellst dich auf eine Variante ein.</p>
      <label class="field"><span>Erwarteter Schlag</span><select id="rallyRead">${shots.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("")}</select></label>
      ${renderRiskField("defenseRisk", 78)}
      <button class="btn primary" data-action="submit-rally-read">Reagieren</button>
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

function renderPointLog(log) {
  if (!log?.length) return `<p class="muted small">Noch keine Aktion in diesem Punkt.</p>`;
  return `<ul class="log-list small">${log.map(item => `<li class="log-item">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMatchLog(points) {
  if (!points?.length) return `<p class="muted small">Nach jedem Punkt erscheint hier die Kurzfassung.</p>`;
  return `<ul class="log-list small">${points.slice().reverse().map((point, index) => `
    <li class="log-item">
      <strong>Punkt ${points.length - index}</strong><br>
      ${escapeHtml(point.summary || "Punkt entschieden.")}<br>
      <span class="muted">Zwischenstand: ${point.score_a ?? point.scoreA}:${point.score_b ?? point.scoreB}</span>
    </li>`).join("")}</ul>`;
}

function syncRangeLabels() {
  document.querySelectorAll("input[type='range'][data-range-label]").forEach(range => {
    const label = document.getElementById(range.dataset.rangeLabel);
    if (label) label.textContent = `${range.value}%`;
  });
}

function phaseLabel(phase) {
  const labels = {
    serve_attack: "Aufschlag wählen",
    serve_read: "Return einstellen",
    rally_attack: "Schlag wählen",
    rally_read: "Gegnerschlag lesen",
    point_result: "Punkt entschieden",
    match_over: "Match beendet"
  };
  return labels[phase] || phase;
}

function getLivePlayer(playerId) {
  const match = state.liveMatch;
  if (!match || !playerId) return null;
  if (match.player_a?.id === playerId) return match.player_a;
  if (match.player_b?.id === playerId) return match.player_b;
  return null;
}

function sideOf(match, playerId) {
  if (!match || !playerId) return "a";
  return match.player_a?.id === playerId ? "a" : "b";
}

function otherSide(side) {
  return side === "a" ? "b" : "a";
}

function availableShotsForLive(match, activeSide) {
  const defenderSide = otherSide(activeSide);
  if (match.positions?.[activeSide] === "net") return NET_SHOTS;
  if (match.positions?.[defenderSide] === "net") return PASSING_SHOTS;
  return BASELINE_SHOTS;
}

function findPlayer(playerId) {
  return (state.lobby?.players || []).find(p => p.id === playerId);
}

async function openLiveMatch(matchId) {
  state.liveMatch = await state.store.getLiveMatch(matchId);
  state.view = "live";
  render();
}

async function backToLobby() {
  await refreshLobby(false);
  state.liveMatch = null;
  state.view = state.session ? "lobby" : "setup";
  render();
}

async function safeAction(callback, options = {}) {
  try {
    await callback();
  } catch (error) {
    console.error(error);
    if (!options.silent) showToast(error.message || "Aktion fehlgeschlagen.");
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
      showToast(session.player?.is_approved ? "Spieler erstellt und angemeldet." : "Registrierung gespeichert. Warte auf Admin-Freigabe.");
    });
  }
});

app.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const playerId = button.dataset.playerId;
  const challengeId = button.dataset.challengeId;
  const liveMatchId = button.dataset.liveMatchId;

  safeAction(async () => {
    if (action === "refresh" || action === "refresh-public") {
      await refreshLobby(true);
      render();
    }

    if (action === "logout") {
      clearSession();
      await refreshLobby(false);
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
      showToast("Forderung angenommen. Jetzt kann ein Live-Spiel gestartet werden.");
    }

    if (action === "quick-match") {
      state.liveMatch = await state.store.startQuickMatch(playerId);
      state.view = "live";
      render();
      showToast("Kurzspiel gestartet. Es zählt nicht für die Rangliste.");
    }

    if (action === "cancel") {
      await state.store.cancelChallenge(challengeId);
      await refreshLobby(false);
      render();
      showToast("Forderung abgebrochen.");
    }

    if (action === "approve-player") {
      await state.store.approvePlayer(playerId);
      await refreshLobby(false);
      render();
      showToast("Spieler freigegeben.");
    }

    if (action === "reject-player") {
      await state.store.rejectPlayer(playerId);
      await refreshLobby(false);
      render();
      showToast("Registrierung abgelehnt und gelöscht.");
    }

    if (action === "start-challenge-live") {
      state.liveMatch = await state.store.startLiveMatch({ challengeId });
      state.view = "live";
      render();
      showToast("Live-Spiel zur Forderung gestartet.");
    }

    if (action === "open-live") {
      await openLiveMatch(liveMatchId);
    }

    if (action === "refresh-live") {
      state.liveMatch = await state.store.getLiveMatch(state.liveMatch.id);
      render();
      showToast("Spiel aktualisiert.");
    }

    if (action === "back-lobby") {
      await backToLobby();
    }

    if (action === "continue-live") {
      state.liveMatch = await state.store.continueLiveMatch(state.liveMatch.id);
      render();
    }

    if (action === "claim-timeout") {
      state.liveMatch = await state.store.claimLiveTimeout(state.liveMatch.id);
      render();
      showToast("Timeout-Sieg wurde gespeichert.");
    }

    if (action === "submit-serve") {
      const serve = findServe(document.getElementById("serveType").value);
      state.liveMatch = await state.store.submitLiveChoice(state.liveMatch.id, {
        kind: "serve",
        serve_id: serve.id,
        risk: Number(document.getElementById("serveRisk").value)
      });
      render();
    }

    if (action === "submit-return-read") {
      const expected = findServe(document.getElementById("returnRead").value);
      state.liveMatch = await state.store.submitLiveChoice(state.liveMatch.id, {
        kind: "serve_read",
        expected_serve_id: expected.id,
        risk: Number(document.getElementById("returnRisk").value)
      });
      render();
    }

    if (action === "submit-rally-shot") {
      const activeSide = sideOf(state.liveMatch, state.liveMatch.active_player_id);
      const shot = findShot(document.getElementById("rallyShot").value, availableShotsForLive(state.liveMatch, activeSide));
      state.liveMatch = await state.store.submitLiveChoice(state.liveMatch.id, {
        kind: "rally_shot",
        shot_id: shot.id,
        risk: Number(document.getElementById("shotRisk").value)
      });
      render();
    }

    if (action === "submit-rally-read") {
      const activeSide = sideOf(state.liveMatch, state.liveMatch.active_player_id);
      const shot = findShot(document.getElementById("rallyRead").value, availableShotsForLive(state.liveMatch, activeSide));
      state.liveMatch = await state.store.submitLiveChoice(state.liveMatch.id, {
        kind: "rally_read",
        expected_shot_id: shot.id,
        risk: Number(document.getElementById("defenseRisk").value)
      });
      render();
    }
  });
});

init().catch(error => {
  console.error(error);
  setConnectionBadge("error", "Fehler");
  app.innerHTML = `<section class="card"><h2>Start fehlgeschlagen</h2><p class="muted">${escapeHtml(error.message || "Unbekannter Fehler")}</p></section>`;
});
