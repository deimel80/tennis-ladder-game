const VERSION = "0.9.3";
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
  lastLobbyRenderAt: 0,
  lobbyPage: "start",
  publicEntered: false,
  selectedProfileId: null,
  playerProfile: null
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
    quick_match_allowed: raw.quick_match_allowed === undefined ? null : Boolean(raw.quick_match_allowed),
    tournament_wins: Number(raw.tournament_wins || 0),
    tournament_runnerups: Number(raw.tournament_runnerups || 0)
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

function formatDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function matchTypeLabel(type) {
  if (type === "quick") return "Kurzspiel";
  if (type === "tournament") return "Turnier";
  return "Rangliste";
}

function tournamentStatusLabel(status) {
  const labels = {
    registration_open: "Anmeldung offen",
    tableau_generated: "Tableau bereit",
    running: "läuft",
    completed: "beendet",
    cancelled: "abgesagt"
  };
  return labels[status] || status;
}

function roundLabel(roundNo, maxRound) {
  if (roundNo === maxRound) return "Finale";
  if (roundNo === maxRound - 1) return "Halbfinale";
  if (roundNo === maxRound - 2) return "Viertelfinale";
  return `Runde ${roundNo}`;
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

  async renamePlayer(playerId, displayName) {
    const { data, error } = await this.client.rpc("admin_rename_player", {
      p_session_token: state.session?.token,
      p_player_id: playerId,
      p_display_name: displayName
    });
    if (error) throw error;
    return normalizePlayer(data);
  }

  async getPlayerProfile(playerId) {
    const { data, error } = await this.client.rpc("get_player_profile", {
      p_session_token: state.session?.token || null,
      p_player_id: playerId
    });
    if (error) throw error;
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    return {
      player: normalizePlayer(payload.player),
      matches: payload.matches || [],
      tournaments: payload.tournaments || []
    };
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

  async createTournament(payload) {
    const { data, error } = await this.client.rpc("create_tournament", {
      p_session_token: state.session?.token,
      p_name: payload.name,
      p_starts_at: payload.startsAt,
      p_registration_deadline: payload.registrationDeadline,
      p_max_players: payload.maxPlayers
    });
    if (error) throw error;
    return data;
  }

  async joinTournament(tournamentId) {
    const { data, error } = await this.client.rpc("join_tournament", {
      p_session_token: state.session?.token,
      p_tournament_id: tournamentId
    });
    if (error) throw error;
    return data;
  }

  async leaveTournament(tournamentId) {
    const { data, error } = await this.client.rpc("leave_tournament", {
      p_session_token: state.session?.token,
      p_tournament_id: tournamentId
    });
    if (error) throw error;
    return data;
  }

  async generateTournamentBracket(tournamentId) {
    const { data, error } = await this.client.rpc("generate_tournament_bracket", {
      p_session_token: state.session?.token,
      p_tournament_id: tournamentId
    });
    if (error) throw error;
    return data;
  }

  async cancelTournament(tournamentId) {
    const { data, error } = await this.client.rpc("cancel_tournament", {
      p_session_token: state.session?.token,
      p_tournament_id: tournamentId
    });
    if (error) throw error;
    return data;
  }

  async startTournamentMatch(tournamentMatchId) {
    const { data, error } = await this.client.rpc("start_tournament_match", {
      p_session_token: state.session?.token,
      p_tournament_match_id: tournamentMatchId
    });
    if (error) throw error;
    return this.normalizeLiveMatch(data);
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
      tournaments: payload.tournaments || [],
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
        if (!shouldPauseLobbyAutoRender()) {
          render();
        }
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

function shouldPauseLobbyAutoRender() {
  const active = document.activeElement;
  const isTyping = Boolean(active && active.closest && active.closest("form"));
  const openAdminDetails = Boolean(document.querySelector("details.admin-details[open]"));
  return isTyping || openAdminDetails;
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
  const tournaments = state.lobby?.tournaments || [];

  if (!state.publicEntered) {
    app.innerHTML = renderPublicLandingOnly(players, tournaments);
    return;
  }

  app.innerHTML = `
    <section class="grid app-entry-grid">
      <div class="card compact entry-head">
        <div>
          <p class="eyebrow">Court Clash</p>
          <h2>Spielbereich</h2>
          <p class="muted">Melde dich an, sieh die Rangliste oder prüfe deine Nachrichten und Turniere.</p>
        </div>
        <button class="btn ghost" data-action="back-public-landing">Zur Startseite</button>
      </div>

      <div id="publicAuthSection" class="card auth-card">
        <div class="card-title-row">
          <div>
            <h2>Anmelden</h2>
            <p class="muted">Neue Spieler registrieren sich mit Name und Passwort. Danach muss ein Admin die Freigabe erteilen.</p>
          </div>
        </div>
        <div class="setup-columns">
          <form id="loginForm" class="card compact form-grid">
            <h3>Login</h3>
            <label class="field"><span>Spielername</span><input id="loginName" autocomplete="username" placeholder="z. B. Stefan" required /></label>
            <label class="field"><span>Passwort</span><input id="loginPin" type="password" autocomplete="current-password" placeholder="Passwort" required /></label>
            <button class="btn primary" type="submit">Einloggen</button>
          </form>
          <form id="registerForm" class="card compact form-grid">
            <h3>Freigabe anfragen</h3>
            <label class="field"><span>Spielername</span><input id="registerName" autocomplete="username" placeholder="Name" required /></label>
            <label class="field"><span>Passwort</span><input id="registerPin" type="password" minlength="6" maxlength="72" autocomplete="new-password" placeholder="mind. 6 Zeichen" required /></label>
            <button class="btn" type="submit">Registrieren</button>
          </form>
        </div>
      </div>

      <div class="grid two public-sections">
        <div id="publicRankingSection" class="card compact">
          <div class="card-title-row">
            <div>
              <h2>Rangliste</h2>
              <p class="muted">Öffentlich sichtbar. Zum Fordern bitte anmelden.</p>
            </div>
            <button class="btn ghost" data-action="refresh-public">Aktualisieren</button>
          </div>
          ${renderRankingTable(players, null, { showActions: false })}
        </div>

        <div id="publicTournamentsSection" class="card compact">
          <div class="card-title-row">
            <div>
              <h2>Turniere</h2>
              <p class="muted">Geplante Abendturniere.</p>
            </div>
          </div>
          ${renderTournaments(tournaments, null, false, false)}
        </div>
      </div>

      <div class="card compact">
        <h2>Letzte Matches</h2>
        ${renderRecentMatches(recentMatches)}
      </div>
    </section>`;
}

function renderMainNav(activePage, isAdmin) {
  const tabs = [
    ["start", "Start"],
    ["ranking", "Rangliste"],
    ["matches", "Spiele"],
    ["tournaments", "Turniere"],
    ["profile", "Profil"]
  ];
  if (isAdmin) tabs.push(["admin", "Admin"]);
  return `
    <nav class="page-tabs" aria-label="Hauptbereiche">
      ${tabs.map(([page, label]) => `<button class="tab-btn ${activePage === page ? "active" : ""}" data-action="set-page" data-page="${page}">${label}</button>`).join("")}
    </nav>`;
}

function renderProfileSummary(current) {
  return `
    <div class="card compact profile-mini-card">
      <div class="profile-avatar">${escapeHtml((current?.display_name || "?").slice(0, 1).toUpperCase())}</div>
      <div>
        <h2>Dein Stand</h2>
        <p class="muted small">Rang ${current?.rank_position || "-"} · ${current?.wins || 0} Siege · ${current?.losses || 0} Niederlagen</p>
      </div>
      <div class="mini-trophy-row">
        <span class="pill">🏆 ${current?.tournament_wins || 0}</span>
        <span class="pill">🥈 ${current?.tournament_runnerups || 0}</span>
      </div>
      <button class="btn ghost full" data-action="open-profile" data-player-id="${current?.id || ""}">Profil öffnen</button>
    </div>`;
}

function renderRulesCard() {
  return `
    <div class="card compact">
      <h2>Aktuelle Regeln</h2>
      <ul class="log-list small">
        <li class="log-item"><strong>Gewinn:</strong> erster Spieler mit ${WIN_POINTS} Punkten.</li>
        <li class="log-item"><strong>Fordern:</strong> Top 3 nur direkt davor, Top 10 maximal 2 Plätze, danach maximal 5 Plätze nach oben.</li>
        <li class="log-item"><strong>Sperre:</strong> pro Spieler nur eine aktive Forderung oder ein laufendes Live-Spiel.</li>
        <li class="log-item"><strong>Ablauf:</strong> offene Forderung 24 Stunden, angenommene Forderung 30 Minuten bis Spielstart.</li>
        <li class="log-item"><strong>Kurzspiel:</strong> zählt nicht für Rangliste und Statistik.</li>
      </ul>
    </div>`;
}

function getTopPlayers(players, limit = 3) {
  return [...(players || [])]
    .sort((a, b) => (a.rank_position ?? 9999) - (b.rank_position ?? 9999))
    .slice(0, limit);
}



function renderLandingPodium(players) {
  const topPlayers = getTopPlayers(players, 3);
  const meta = [
    { place: "1. Platz", medal: "🏆", className: "champion", label: "Spitze" },
    { place: "2. Platz", medal: "🥈", className: "runner", label: "Jäger" },
    { place: "3. Platz", medal: "🥉", className: "third", label: "Top 3" }
  ];

  if (!topPlayers.length) return `<p class="muted small">Noch keine Spieler vorhanden.</p>`;

  return `
    <div class="landing-podium">
      ${topPlayers.map((player, index) => {
        const item = meta[index] || meta[2];
        const winLoss = `${player.wins || 0}:${player.losses || 0}`;
        return `
          <article class="podium-card ${item.className}">
            <div class="podium-rank-watermark">${player.rank_position ?? index + 1}</div>
            <div class="podium-medal">${item.medal}</div>
            <div class="podium-body">
              <div class="podium-place">${item.place}</div>
              <h3>${escapeHtml(player.display_name)}</h3>
              <div class="podium-badges">
                <span>${item.label}</span>
                <span>Bilanz ${winLoss}</span>
              </div>
              <div class="podium-stats">
                <span><strong>${player.tournament_wins || 0}</strong><small>🏆 Siege</small></span>
                <span><strong>${player.tournament_runnerups || 0}</strong><small>🥈 Finales</small></span>
              </div>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

function renderPublicLandingOnly(players, tournaments) {
  return `
    <section class="clean-public-landing clean-landing">
      <div class="clean-hero-card">
        <div class="clean-hero-bg">
          <img src="hero-tennis.png" alt="Tennisschläger und Tennisball auf einem Tennisplatz" />
        </div>
        <div class="clean-hero-overlay" aria-hidden="true"></div>
        <div class="clean-hero-content">
          <p class="eyebrow">Court Clash</p>
          <h2>Court Clash</h2>
          <p class="clean-claim">Fordere Spieler heraus. Gewinne Matches. Steig in der Rangliste.</p>
          <div class="clean-info-row"><span>Live-Matches</span><span>Rangliste</span><span>Turniere</span></div>
          ${renderNextTournamentCard(tournaments)}
          <div class="hero-actions clean-actions">
            <button class="btn primary large" data-action="enter-public-app">Zum Spiel</button>
            <button class="btn large" data-action="enter-public-ranking">Rangliste ansehen</button>
          </div>
        </div>
      </div>
      <div class="clean-summary-grid single">
        ${renderTopPlayersSection(players)}
      </div>
    </section>`;
}

function renderLandingHero({ loggedIn = false, current = null, pendingApproval = false } = {}) {
  const title = loggedIn ? `Willkommen${current?.display_name ? `, ${escapeHtml(current.display_name)}` : ""}` : "Court Clash";
  const text = loggedIn
    ? (pendingApproval
        ? "Dein Account wartet noch auf die Freigabe. Schau dir bis dahin die Rangliste und die geplanten Turniere an."
        : "Fordere Spieler heraus. Gewinne Matches. Steig in der Rangliste.")
    : "Fordere Spieler heraus. Gewinne Matches. Steig in der Rangliste.";
  const primaryLabel = loggedIn ? (pendingApproval ? "Zur Rangliste" : "Rangliste öffnen") : "Zum Spiel";
  const primaryAction = loggedIn ? "set-page" : "scroll-login";
  const primaryTarget = loggedIn ? "ranking" : "";
  const secondaryLabel = loggedIn ? "Turniere ansehen" : "Rangliste ansehen";
  const secondaryAction = loggedIn ? "set-page" : "scroll-ranking";
  const secondaryTarget = loggedIn ? "tournaments" : "";

  return `
    <section class="landing-hero card">
      <div class="landing-copy">
        <p class="eyebrow">Court Clash</p>
        <h2 class="landing-title">${title}</h2>
        <p class="landing-subtitle">${text}</p>
        <div class="hero-actions">
          <button class="btn primary large" data-action="${primaryAction}" ${primaryTarget ? `data-page="${primaryTarget}"` : ""}>${primaryLabel}</button>
          <button class="btn large" data-action="${secondaryAction}" ${secondaryTarget ? `data-page="${secondaryTarget}"` : ""}>${secondaryLabel}</button>
        </div>
      </div>
      <div class="landing-media">
        <img src="hero-tennis.png" alt="Tennisschläger und Tennisball auf einem Tennisplatz" />
      </div>
    </section>`;
}

function renderTopPlayersSection(players) {
  return `
    <section class="card compact top-players-section">
      <div class="card-title-row">
        <div>
          <p class="eyebrow">Live aus der Rangliste</p>
          <h2>Aktuelle Top-Spieler</h2>
        </div>
        <span class="pill">automatisch aktuell</span>
      </div>
      ${renderLandingPodium(players)}
    </section>`;
}

function renderFeatureNavCards(loggedIn = false) {
  const cards = loggedIn ? [
    { title: "Rangliste", text: "Fordere andere heraus und arbeite dich nach oben.", action: "set-page", page: "ranking", icon: "🎾" },
    { title: "Spiele", text: "Starte Kurzspiele und bearbeite laufende Matches.", action: "set-page", page: "matches", icon: "⚡" },
    { title: "Turniere", text: "Melde dich für Abendturniere an und kämpfe um Pokale.", action: "set-page", page: "tournaments", icon: "🏆" }
  ] : [
    { title: "Rangliste", text: "Die besten Spieler und ihre aktuelle Platzierung.", action: "scroll-ranking", page: "", icon: "🎾" },
    { title: "Turniere", text: "Geplante Abendturniere mit Anmeldung und Tableau.", action: "scroll-tournaments", page: "", icon: "🏆" },
    { title: "Mitspielen", text: "Jetzt einloggen oder Registrierung zur Freigabe schicken.", action: "scroll-login", page: "", icon: "➡️" }
  ];

  return `
    <div class="feature-grid">
      ${cards.map(card => `
        <button class="feature-tile" data-action="${card.action}" ${card.page ? `data-page="${card.page}"` : ""}>
          <span class="feature-icon">${card.icon}</span>
          <span class="feature-title">${card.title}</span>
          <span class="feature-text">${card.text}</span>
        </button>`).join("")}
    </div>`;
}


function getNextTournament(tournaments) {
  return [...(tournaments || [])]
    .filter(t => ["registration_open", "tableau_generated", "running"].includes(t.status))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] || null;
}

function computeCurrentStreak(matches, playerId) {
  const playerMatches = [...(matches || [])]
    .filter(m => m.player_a_id === playerId || m.player_b_id === playerId)
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  if (!playerMatches.length) return { type: "none", count: 0, label: "Noch keine Serie" };
  const firstWon = playerMatches[0].winner_id === playerId;
  let count = 0;
  for (const match of playerMatches) {
    if ((match.winner_id === playerId) === firstWon) count += 1;
    else break;
  }
  return {
    type: firstWon ? "win" : "loss",
    count,
    label: firstWon ? `${count} Sieg${count === 1 ? "" : "e"} in Folge` : `${count} Niederlage${count === 1 ? "" : "n"} in Folge`
  };
}

function computeHallOfFame(players, tournaments) {
  const byWins = [...(players || [])]
    .filter(p => (p.tournament_wins || 0) > 0)
    .sort((a, b) => (b.tournament_wins - a.tournament_wins) || (a.rank_position || 9999) - (b.rank_position || 9999))
    .slice(0, 5);
  const recentChampions = [...(tournaments || [])]
    .filter(t => t.status === "completed" && t.winner_name)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 5);
  return { byWins, recentChampions };
}

function renderNextTournamentCard(tournaments) {
  const next = getNextTournament(tournaments);
  if (!next) {
    return `
      <div class="next-tournament-card muted-card">
        <span class="feature-icon">🏆</span>
        <div><strong>Nächstes Turnier</strong><br><span class="muted small">Noch kein Turnier geplant.</span></div>
      </div>`;
  }
  return `
    <div class="next-tournament-card">
      <span class="feature-icon">🏆</span>
      <div>
        <strong>${escapeHtml(next.name)}</strong><br>
        <span class="muted small">${formatDate(next.starts_at)} · ${tournamentStatusLabel(next.status)} · ${next.participant_count || 0}/${next.max_players}</span>
      </div>
    </div>`;
}

function renderHallOfFame(players, tournaments) {
  const fame = computeHallOfFame(players, tournaments);
  return `
    <div class="card compact hall-card">
      <div class="card-title-row">
        <div><p class="eyebrow">Hall of Fame</p><h2>Turnierhelden</h2></div>
        <span class="pill">🏆</span>
      </div>
      ${fame.byWins.length ? `<ul class="fame-list">${fame.byWins.map((p, idx) => `
        <li><span class="rank-bubble">${idx + 1}</span><strong>${escapeHtml(p.display_name)}</strong><span>🏆 ${p.tournament_wins || 0} · 🥈 ${p.tournament_runnerups || 0}</span></li>`).join("")}</ul>` : `<p class="muted small">Noch keine Turniersieger vorhanden.</p>`}
      ${fame.recentChampions.length ? `<h3 class="small-heading">Letzte Champions</h3><ul class="log-list small">${fame.recentChampions.map(t => `<li class="log-item"><strong>${escapeHtml(t.winner_name)}</strong><br><span class="muted">${escapeHtml(t.name)} · ${formatDate(t.starts_at)}</span></li>`).join("")}</ul>` : ""}
    </div>`;
}

function renderPlayerProfile(profile, currentId, isAdmin = false) {
  if (!profile?.player) return `<div class="card"><h2>Profil</h2><p class="muted">Profil wird geladen.</p></div>`;
  const player = profile.player;
  const matches = profile.matches || [];
  const streak = computeCurrentStreak(matches, player.id);
  const winRate = (player.wins + player.losses) > 0 ? Math.round((player.wins / (player.wins + player.losses)) * 100) : 0;
  const isSelf = player.id === currentId;
  const initials = escapeHtml((player.display_name || "?").slice(0, 1).toUpperCase());
  const recent = matches.slice(0, 3);

  const formClass = streak.type === "win" ? "up" : streak.type === "loss" ? "down" : "neutral";
  const formArrow = streak.type === "win" ? "▲" : streak.type === "loss" ? "▼" : "•";
  const formText = streak.type === "win"
    ? `${streak.count} Sieg${streak.count === 1 ? "" : "e"} in Folge`
    : streak.type === "loss"
      ? `${streak.count} Niederlage${streak.count === 1 ? "" : "n"} in Folge`
      : "Noch keine Serie";

  return `
    <section class="profile-page-pro">
      <div class="profile-card-pro">
        <div class="profile-card-main">
          <div class="profile-avatar-ring"><span>${initials}</span></div>
          <div class="profile-card-copy">
            <p class="eyebrow">Spielerprofil</p>
            <h2>${escapeHtml(player.display_name)}${isSelf ? ` <span class="pill">du</span>` : ""}</h2>
            <p class="muted">Rang ${player.rank_position || "-"} · ${streak.label}</p>
          </div>
        </div>
        <div class="profile-medal-strip">
          <span><strong>🏆 ${player.tournament_wins || 0}</strong><small>Turniersiege</small></span>
          <span><strong>🥈 ${player.tournament_runnerups || 0}</strong><small>Zweite Plätze</small></span>
        </div>
      </div>

      <div class="profile-stat-tiles">
        <article class="stat-tile"><span>Bilanz</span><strong>${player.wins}:${player.losses}</strong><small>Siege : Niederlagen</small></article>
        <article class="stat-tile"><span>Siegquote</span><strong>${winRate}%</strong><small>aus Ranglisten- und Spielmatches</small></article>
        <article class="stat-tile"><span>Punkte</span><strong>${player.points_for}:${player.points_against}</strong><small>gespielte Punkte</small></article>
        <article class="stat-tile form-tile ${formClass}"><span>Form</span><div class="form-indicator"><b class="form-arrow">${formArrow}</b><strong>${streak.count || 0}</strong></div><small>${escapeHtml(formText)}</small></article>
      </div>

      ${isAdmin ? `
        <div class="card compact">
          <h2>Admin: Namen ändern</h2>
          <form class="form-grid rename-player-form" data-player-id="${player.id}">
            <label class="field"><span>Neuer Name</span><input value="${escapeHtml(player.display_name)}" maxlength="30" required /></label>
            <button class="btn primary" type="submit">Namen speichern</button>
          </form>
        </div>` : ""}

      <div class="card compact profile-history-card">
        <div class="card-title-row">
          <div>
            <p class="eyebrow">Historie</p>
            <h2>Match-Historie</h2>
            <p class="muted">Die letzten gespeicherten Matches dieses Spielers.</p>
          </div>
          <span class="pill">${matches.length}</span>
        </div>
        ${renderPlayerMatchHistory(matches, player.id)}
      </div>
    </section>`;
}
function renderPlayerMatchHistory(matches, playerId) {
  if (!matches.length) return `<p class="muted">Noch keine Matches vorhanden.</p>`;
  return `<ul class="profile-match-list">${matches.map(match => {
    const won = match.winner_id === playerId;
    const opponent = match.player_a_id === playerId ? match.player_b_name : match.player_a_name;
    return `<li class="profile-match-item ${won ? "won" : "lost"}">
      <div><strong>${won ? "Sieg" : "Niederlage"} gegen ${escapeHtml(opponent)}</strong><br><span class="muted small">${matchTypeLabel(match.match_type)} · ${formatDate(match.completed_at)}</span></div>
      <div class="match-score">${match.score_a}:${match.score_b}</div>
    </li>`;
  }).join("")}</ul>`;
}


function getPlayerTournamentEntries(tournaments, currentId) {
  if (!currentId) return [];
  const entries = [];
  (tournaments || []).forEach(tournament => {
    if ((tournament.entries || []).some(entry => entry.player_id === currentId)) {
      entries.push(tournament);
    }
  });
  return entries;
}

function getPlayerTournamentMatches(tournaments, currentId) {
  if (!currentId) return [];
  const matches = [];
  (tournaments || []).forEach(tournament => {
    (tournament.matches || []).forEach(match => {
      if ([match.player_a_id, match.player_b_id].includes(currentId)) {
        matches.push({ ...match, tournament_name: tournament.name, tournament_status: tournament.status });
      }
    });
  });
  return matches;
}

function createDashboardNotifications(current, challenges = [], liveMatches = [], tournaments = []) {
  if (!current?.id) return [];
  const currentId = current.id;
  const notifications = [];

  if (!current.is_approved) {
    notifications.push({ icon: "⏳", title: "Freigabe ausstehend", text: "Dein Account wartet noch auf die Admin-Freigabe.", level: "warning", actionPage: "start" });
  }

  challenges.forEach(challenge => {
    if (challenge.status === "open" && challenge.challenged_id === currentId) {
      notifications.push({ icon: "🎾", title: "Neue Forderung", text: `${challenge.challenger_name} fordert dich heraus.`, level: "important", actionPage: "matches" });
    }
    if (challenge.status === "accepted" && [challenge.challenger_id, challenge.challenged_id].includes(currentId) && !challenge.active_live_match_id) {
      notifications.push({ icon: "⚡", title: "Ranglistenspiel bereit", text: `${challenge.challenger_name} gegen ${challenge.challenged_name} kann gestartet werden.`, level: "important", actionPage: "matches" });
    }
  });

  liveMatches.forEach(match => {
    if (![match.player_a_id, match.player_b_id].includes(currentId)) return;
    const opponent = match.player_a_id === currentId ? match.player_b_name : match.player_a_name;
    if (match.waiting_for_player_id === currentId) {
      notifications.push({ icon: "🔔", title: "Du bist am Zug", text: `${matchTypeLabel(match.match_type)} gegen ${opponent}: Eingabe erforderlich.`, level: "important", liveMatchId: match.id });
    } else {
      notifications.push({ icon: "⌛", title: "Warte auf Gegner", text: `${opponent} ist im laufenden ${matchTypeLabel(match.match_type)} am Zug.`, level: "info", liveMatchId: match.id });
    }
  });

  const now = Date.now();
  getPlayerTournamentEntries(tournaments, currentId).forEach(tournament => {
    const startsAt = new Date(tournament.starts_at).getTime();
    const hoursUntil = (startsAt - now) / 36e5;
    if (["registration_open", "tableau_generated", "running"].includes(tournament.status) && hoursUntil >= -2 && hoursUntil <= 24) {
      notifications.push({ icon: "🏆", title: "Turnier-Erinnerung", text: `${tournament.name} startet ${formatDate(tournament.starts_at)}.`, level: hoursUntil <= 1 ? "important" : "info", actionPage: "tournaments" });
    }
  });

  getPlayerTournamentMatches(tournaments, currentId).forEach(match => {
    if (match.status === "ready") {
      notifications.push({ icon: "🏁", title: "Turniermatch bereit", text: `${match.tournament_name}: Dein Match kann gestartet werden.`, level: "important", actionPage: "tournaments" });
    }
    if (match.live_match_id && ["active", "running"].includes(match.status)) {
      notifications.push({ icon: "🎮", title: "Turniermatch läuft", text: `${match.tournament_name}: Zurück ins Match.`, level: "important", liveMatchId: match.live_match_id });
    }
  });

  const seen = new Set();
  return notifications.filter(item => {
    const key = `${item.title}|${item.text}|${item.liveMatchId || item.actionPage || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function renderNotificationPanel(notifications, compact = false) {
  const count = notifications.length;
  return `
    <div class="card compact notification-card ${count ? "has-items" : ""}">
      <div class="card-title-row">
        <div>
          <p class="eyebrow">Nachrichten</p>
          <h2>Aktuelles</h2>
        </div>
        <span class="pill ${count ? "danger" : ""}">${count}</span>
      </div>
      ${count ? `<ul class="notification-list ${compact ? "compact" : ""}">
        ${notifications.map(item => `
          <li class="notification-item ${item.level || "info"}">
            <span class="notification-icon">${item.icon || "•"}</span>
            <span class="notification-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></span>
            ${item.liveMatchId ? `<button class="btn small" data-action="open-live" data-live-match-id="${item.liveMatchId}">Öffnen</button>` : item.actionPage ? `<button class="btn small" data-action="set-page" data-page="${item.actionPage}">Ansehen</button>` : ""}
          </li>`).join("")}
      </ul>` : `<p class="muted small">Keine neuen Hinweise. Wenn du angemeldet bleibst, erscheinen Turnierstarts, Forderungen und laufende Matches hier automatisch.</p>`}
    </div>`;
}

function renderLobby() {
  const currentId = state.session?.player?.id;
  const players = state.lobby?.players || [];
  const current = state.lobby?.current_player || players.find(p => p.id === currentId) || state.session?.player;
  const challenges = state.lobby?.challenges || [];
  const recentMatches = state.lobby?.recent_matches || [];
  const liveMatches = state.lobby?.live_matches || [];
  const pendingPlayers = state.lobby?.pending_players || [];
  const tournaments = state.lobby?.tournaments || [];
  const isApproved = Boolean(current?.is_approved);
  const isAdmin = Boolean(current?.is_admin);
  const activePage = state.lobbyPage || "start";
  const notifications = createDashboardNotifications(current, challenges, liveMatches, tournaments);

  if (!isApproved) {
    let pendingMain = "";
    if (activePage === "tournaments") {
      pendingMain = `<div class="card"><div class="card-title-row"><div><h2>Turniere</h2><p class="muted">Du siehst Turniere, kannst dich aber erst nach Freigabe anmelden.</p></div></div>${renderTournaments(tournaments, current?.id, false, false)}</div>`;
    } else if (activePage === "ranking") {
      pendingMain = `<div class="card"><div class="card-title-row"><div><h2>Rangliste</h2><p class="muted">Nur freigegebene Spieler erscheinen in der Tabelle.</p></div></div>${renderRankingTable(players, null, { showActions: false })}</div>`;
    } else if (activePage === "profile") {
      pendingMain = renderPlayerProfile(state.playerProfile || { player: current, matches: [] }, currentId, false);
    } else {
      pendingMain = `
        ${renderLandingHero({ loggedIn: true, current, pendingApproval: true })}
        ${renderTopPlayersSection(players)}
        <div class="card compact"><h2>Freigabe ausstehend</h2><p class="muted">Angemeldet als <strong>${escapeHtml(current?.display_name || "?")}</strong>. Dieses Konto ist noch nicht vom Admin freigegeben.</p><div class="notice small">Du kannst die öffentliche Rangliste und die Turniere sehen. Nach der Freigabe kannst du fordern, Kurzspiele starten und an Turnieren teilnehmen.</div></div>`;
    }
    app.innerHTML = `
      <section class="grid two">
        <div class="grid">
          <div class="card compact lobby-head"><div><p class="eyebrow">Angemeldet</p><h2>${escapeHtml(current?.display_name || "?")}</h2></div><div class="btn-row"><button class="btn ghost" data-action="refresh">Aktualisieren</button><button class="btn ghost" data-action="logout">Abmelden</button></div></div>
          ${renderMainNav(activePage, false)}${pendingMain}
        </div>
        <aside class="grid"><div class="card compact"><h2>Status</h2><p class="muted small">Warte auf Admin-Freigabe. Nach der Freigabe bitte aktualisieren oder neu einloggen.</p></div><div class="card compact"><h2>Letzte Matches</h2>${renderRecentMatches(recentMatches)}</div></aside>
      </section>`;
    return;
  }

  let mainContent = "";
  if (activePage === "tournaments") {
    mainContent = `<div class="card"><div class="card-title-row"><div><h2>Turniere</h2><p class="muted">Geplante K.O.-Turniere mit Anmeldung, Tableau und Pokalen für Platz 1 und 2.</p></div><button class="btn ghost" data-action="refresh">Aktualisieren</button></div>${isAdmin ? renderTournamentAdminForm() : ""}${renderTournaments(tournaments, currentId, isApproved, isAdmin)}</div>`;
  } else if (activePage === "matches") {
    mainContent = `${renderNotificationPanel(notifications)}<div class="card"><div class="card-title-row"><div><h2>Live-Spiele</h2><p class="muted">Laufende Matches, bei denen du beteiligt bist.</p></div><button class="btn ghost" data-action="refresh">Aktualisieren</button></div>${renderLiveMatches(liveMatches, currentId)}</div><div class="card"><div class="card-title-row"><div><h2>Forderungen</h2><p class="muted">Ranglistenspiele laufen über Fordern → Annehmen → Live-Spiel starten.</p></div></div>${renderChallenges(challenges, currentId)}</div>`;
  } else if (activePage === "admin" && isAdmin) {
    mainContent = `${renderAdminPanel(pendingPlayers, players)}`;
  } else if (activePage === "ranking") {
    mainContent = `<div class="card"><div class="card-title-row"><div><h2>Rangliste</h2><p class="muted">Forderungen sind ranglistenrelevant, Kurzspiele nicht.</p></div><button class="btn ghost" data-action="refresh">Aktualisieren</button></div>${renderRankingTable(players, currentId)}</div>`;
  } else if (activePage === "profile") {
    const fallback = { player: players.find(p => p.id === (state.selectedProfileId || currentId)) || current, matches: recentMatches.filter(m => [m.player_a_id, m.player_b_id].includes(state.selectedProfileId || currentId)) };
    mainContent = renderPlayerProfile(state.playerProfile || fallback, currentId, isAdmin);
  } else {
    const myOpenChallenges = challenges.filter(challenge => [challenge.challenger_id, challenge.challenged_id].includes(currentId) && ["open", "accepted"].includes(challenge.status));
    const myLiveMatches = liveMatches.filter(match => [match.player_a_id, match.player_b_id].includes(currentId));
    const nextTournament = getNextTournament(tournaments);
    mainContent = `
      <div class="card compact clean-dashboard-head"><div><p class="eyebrow">Court Clash</p><h2>Willkommen, ${escapeHtml(current?.display_name || "?")}</h2><p class="muted">Fordern, spielen oder Turnier anmelden. Details liegen in den einzelnen Bereichen.</p></div></div>
      ${renderNotificationPanel(notifications)}
      ${renderNextTournamentCard(tournaments)}
      <div class="feature-grid compact-actions">
        <button class="feature-tile" data-action="set-page" data-page="ranking"><span class="feature-icon">🎾</span><span class="feature-title">Rangliste</span><span class="feature-text">Fordere passende Gegner.</span></button>
        <button class="feature-tile" data-action="set-page" data-page="matches"><span class="feature-icon">⚡</span><span class="feature-title">Spiele</span><span class="feature-text">Offene Forderungen und Live-Matches.</span></button>
        <button class="feature-tile" data-action="set-page" data-page="tournaments"><span class="feature-icon">🏆</span><span class="feature-title">Turniere</span><span class="feature-text">Anmelden, Tableau, Pokale.</span></button>
      </div>
      <div class="grid three dashboard-stats">
        <div class="score-card"><span class="label">Offene Forderungen</span><div class="score-number">${myOpenChallenges.length}</div></div>
        <div class="score-card"><span class="label">Live-Spiele</span><div class="score-number">${myLiveMatches.length}</div></div>
        <div class="score-card"><span class="label">Nächstes Turnier</span><div class="small">${nextTournament ? `${escapeHtml(nextTournament.name)}<br><span class="muted">${formatDate(nextTournament.starts_at)}</span>` : "Keins geplant"}</div></div>
      </div>
      ${renderHallOfFame(players, tournaments)}`;
  }

  app.innerHTML = `
    <section class="grid two">
      <div class="grid">
        <div class="card compact lobby-head"><div><p class="eyebrow">Angemeldet</p><h2>${escapeHtml(current?.display_name || "?")}${isAdmin ? ` <span class="pill">Admin</span>` : ""}</h2></div><div class="btn-row"><button class="btn ghost" data-action="refresh">Aktualisieren</button><button class="btn ghost" data-action="logout">Abmelden</button></div></div>
        ${renderMainNav(activePage, isAdmin)}${mainContent}
      </div>
      <aside class="grid">${renderProfileSummary(current)}${activePage !== "start" ? renderNotificationPanel(notifications, true) : ""}${activePage === "start" ? renderRulesCard() : ""}<div class="card compact"><h2>Letzte Matches</h2>${renderRecentMatches(recentMatches)}</div></aside>
    </section>`;
}
function renderAdminPanel(pendingPlayers, players = []) {
  return `
    <div class="grid">
      <div class="card">
        <div class="card-title-row"><div><h2>Admin: Spieler-Freigaben</h2><p class="muted">Neue Registrierungen erscheinen erst nach Freigabe in der Rangliste.</p></div><span class="pill">${pendingPlayers.length} offen</span></div>
        ${!pendingPlayers.length ? `<p class="muted">Keine offenen Freigaben.</p>` : `<ul class="challenge-list">${pendingPlayers.map(player => `
          <li class="challenge-item"><div class="challenge-title"><span>${escapeHtml(player.display_name)}</span><span class="status open">wartet</span></div><p class="muted small">Noch nicht in der Rangliste. Freigabe hängt ihn hinten an.</p><div class="btn-row"><button class="btn primary" data-action="approve-player" data-player-id="${player.id}">Freigeben</button><button class="btn danger" data-action="reject-player" data-player-id="${player.id}">Ablehnen/löschen</button></div></li>`).join("")}</ul>`}
      </div>
      <div class="card">
        <div class="card-title-row"><div><h2>Admin: Spieler verwalten</h2><p class="muted">Namen ändern oder Profil öffnen.</p></div></div>
        <div class="admin-player-grid">
          ${players.map(player => `<div class="admin-player-row"><strong>${escapeHtml(player.display_name)}</strong><span class="muted small">Rang ${player.rank_position}</span><div class="btn-row"><button class="btn ghost" data-action="open-profile" data-player-id="${player.id}">Profil</button><button class="btn" data-action="prompt-rename-player" data-player-id="${player.id}" data-player-name="${escapeHtml(player.display_name)}">Name ändern</button></div></div>`).join("") || `<p class="muted">Keine Spieler vorhanden.</p>`}
        </div>
      </div>
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
        <td>${showActions ? `<button class="link-button" data-action="open-profile" data-player-id="${player.id}"><strong>${escapeHtml(player.display_name)}</strong></button>` : `<strong>${escapeHtml(player.display_name)}</strong>`}${isSelf ? ` <span class="pill">du</span>` : ""}<div class="muted small">🏆 ${player.tournament_wins || 0} · 🥈 ${player.tournament_runnerups || 0}</div></td>
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
              <span class="status ${match.status}">${matchTypeLabel(match.match_type)} · ${myTurn ? "du bist dran" : statusLabel(match.status)}</span>
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

function renderTournamentAdminForm() {
  const now = new Date();
  const start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const deadline = new Date(start.getTime() - 15 * 60 * 1000);
  return `
    <details class="admin-details">
      <summary>Neues Turnier anlegen</summary>
      <form id="tournamentForm" class="form-grid tournament-form">
        <label class="field"><span>Name</span><input id="tournamentName" placeholder="Freitagabend-Cup" required maxlength="60" /></label>
        <div class="grid two">
          <label class="field"><span>Start</span><input id="tournamentStart" type="datetime-local" value="${formatDateTimeLocal(start)}" required /></label>
          <label class="field"><span>Anmeldeschluss</span><input id="tournamentDeadline" type="datetime-local" value="${formatDateTimeLocal(deadline)}" required /></label>
        </div>
        <label class="field"><span>Max. Teilnehmer</span><select id="tournamentMaxPlayers"><option>4</option><option selected>8</option><option>16</option><option>32</option><option>64</option></select></label>
        <button class="btn primary" type="submit">Turnier erstellen</button>
      </form>
    </details>`;
}

function renderTournaments(tournaments, currentId, canJoin, isAdmin) {
  if (!tournaments.length) return `<p class="muted">Noch keine Turniere angelegt.</p>`;
  return `
    <div class="tournament-list">
      ${tournaments.map(t => {
        const entries = t.entries || [];
        const matches = t.matches || [];
        const maxRound = matches.reduce((max, m) => Math.max(max, Number(m.round_no || 0)), 0);
        const joined = Boolean(t.current_player_joined);
        const registrationOpen = t.status === "registration_open" && new Date(t.registration_deadline).getTime() > Date.now();
        const hasFreeSlot = Number(t.participant_count || 0) < Number(t.max_players || 0);
        const canGenerate = isAdmin && t.status === "registration_open" && Number(t.participant_count || 0) >= 2;
        return `
          <article class="tournament-card">
            <div class="challenge-title">
              <span>${escapeHtml(t.name)}</span>
              <span class="status ${escapeHtml(t.status)}">${tournamentStatusLabel(t.status)}</span>
            </div>
            <p class="muted small">Start: ${formatDate(t.starts_at)} · Anmeldung bis: ${formatDate(t.registration_deadline)} · Teilnehmer: ${t.participant_count || 0}/${t.max_players}</p>
            ${t.status === "completed" ? `<div class="success small">🏆 Sieger: <strong>${escapeHtml(t.winner_name || "?")}</strong>${t.runner_up_name ? ` · 🥈 Zweiter: <strong>${escapeHtml(t.runner_up_name)}</strong>` : ""}</div>` : ""}
            <div class="btn-row">
              ${canJoin && registrationOpen && hasFreeSlot && !joined ? `<button class="btn primary" data-action="join-tournament" data-tournament-id="${t.id}">Anmelden</button>` : ""}
              ${canJoin && registrationOpen && joined ? `<button class="btn danger" data-action="leave-tournament" data-tournament-id="${t.id}">Abmelden</button>` : ""}
              ${canGenerate ? `<button class="btn primary" data-action="generate-tournament" data-tournament-id="${t.id}">Tableau generieren</button>` : ""}
              ${isAdmin && t.status !== "completed" && t.status !== "cancelled" ? `<button class="btn ghost" data-action="cancel-tournament" data-tournament-id="${t.id}">Absagen</button>` : ""}
            </div>
            ${entries.length ? `<div class="muted small">Angemeldet: ${entries.map(e => escapeHtml(e.display_name)).join(", ")}</div>` : `<div class="muted small">Noch keine Anmeldungen.</div>`}
            ${matches.length ? renderTournamentBracket(matches, currentId, maxRound, t.status) : ""}
          </article>`;
      }).join("")}
    </div>`;
}

function renderTournamentBracket(matches, currentId, maxRound, tournamentStatus) {
  const grouped = new Map();
  matches.forEach(match => {
    const round = Number(match.round_no || 0);
    if (!grouped.has(round)) grouped.set(round, []);
    grouped.get(round).push(match);
  });
  return `
    <div class="bracket">
      ${Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([round, roundMatches]) => `
        <div class="bracket-round">
          <h4>${roundLabel(round, maxRound)}</h4>
          ${roundMatches.map(match => {
            const iAmParticipant = currentId && [match.player_a_id, match.player_b_id].includes(currentId);
            const canStart = iAmParticipant && tournamentStatus === "running" && match.status === "ready";
            return `
              <div class="bracket-match ${match.status}">
                <div><strong>${escapeHtml(match.player_a_name || "Freilos/offen")}</strong> vs. <strong>${escapeHtml(match.player_b_name || "Freilos/offen")}</strong></div>
                <div class="muted small">Status: ${escapeHtml(match.status)}${match.winner_name ? ` · Sieger: ${escapeHtml(match.winner_name)}` : ""}</div>
                <div class="btn-row">
                  ${match.live_match_id && ["active", "completed"].includes(match.status) ? `<button class="btn" data-action="open-live" data-live-match-id="${match.live_match_id}">Zum Match</button>` : ""}
                  ${canStart ? `<button class="btn primary" data-action="start-tournament-match" data-tournament-match-id="${match.id}">Turniermatch starten</button>` : ""}
                </div>
              </div>`;
          }).join("")}
        </div>`).join("")}
    </div>`;
}

function renderRecentMatches(matches) {
  if (!matches.length) return `<p class="muted small">Noch keine Matches gespeichert.</p>`;
  return `
    <ul class="log-list small">
      ${matches.map(match => `
        <li class="log-item">
          <strong>${escapeHtml(match.winner_name)} gewinnt</strong> <span class="pill">${matchTypeLabel(match.match_type)}</span><br>
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
  const myTurn = match.waiting_for_player_id === currentId;

  app.innerHTML = `
    <section class="match-mode">
      <div class="match-shell">
        <div class="match-hero">
          <div>
            <p class="eyebrow">${match.match_type === "quick" ? "Kurzspiel" : match.match_type === "tournament" ? "Turniermatch" : "Ranglistenspiel"}</p>
            <h1>${escapeHtml(match.player_a.display_name)} <span>vs</span> ${escapeHtml(match.player_b.display_name)}</h1>
            <p class="match-subline">${match.match_type === "quick" ? "Schnelles Match ohne Einfluss auf die Rangliste." : match.match_type === "tournament" ? "Dieses Match zählt nur für das Turnier." : "Dieses Match zählt für die Rangliste."} Erster Spieler mit ${WIN_POINTS} Punkten gewinnt.</p>
          </div>
          <div class="match-hero-actions">
            <span class="match-chip ${myTurn ? "my-turn" : "waiting"}">${myTurn ? "Du bist dran" : `Warten auf ${escapeHtml(waitingPlayer?.display_name || "Gegner")}`}</span>
            <div class="btn-row">
              <button class="btn ghost" data-action="refresh-live">Aktualisieren</button>
              <button class="btn ghost" data-action="back-lobby">Zurück</button>
            </div>
          </div>
        </div>

        ${renderLiveScoreboard(match)}

        <div class="match-main-grid">
          <div class="match-focus-card">
            ${renderLivePhase(match, currentId, waitingPlayer)}
          </div>
          <aside class="match-side-panel">
            <div class="match-log-card">
              <div class="card-title-row compact-title-row"><h3>Letzte Punkte</h3><span class="pill">${match.match_log?.length || 0}</span></div>
              ${renderMatchLog(match.match_log)}
            </div>
            <div class="match-log-card">
              <div class="card-title-row compact-title-row"><h3>Aktueller Punkt</h3><span class="pill">${match.point_log?.length || 0}</span></div>
              ${renderPointLog(match.point_log)}
            </div>
          </aside>
        </div>
      </div>
    </section>`;
  syncRangeLabels();
  syncChoiceButtons();
}

function renderLiveScoreboard(match) {
  return `
    <div class="match-scoreboard-pro">
      <div class="match-scorecard ${match.waiting_for_player_id === match.player_a.id ? "active" : ""}">
        <div class="match-score-topline">
          <span class="score-name">${escapeHtml(match.player_a.display_name)}</span>
          ${match.point_server_id === match.player_a.id ? `<span class="serve-badge">Aufschlag</span>` : ""}
        </div>
        <div class="score-number">${match.score_a}</div>
      </div>
      <div class="match-score-center">
        <span class="pill">${matchTypeLabel(match.match_type)}</span>
        <strong>${escapeHtml(phaseLabel(match.phase))}</strong>
        <span class="small">Tie-Break bis ${WIN_POINTS}</span>
      </div>
      <div class="match-scorecard ${match.waiting_for_player_id === match.player_b.id ? "active" : ""}">
        <div class="match-score-topline">
          <span class="score-name">${escapeHtml(match.player_b.display_name)}</span>
          ${match.point_server_id === match.player_b.id ? `<span class="serve-badge">Aufschlag</span>` : ""}
        </div>
        <div class="score-number">${match.score_b}</div>
      </div>
    </div>`;
}

function renderLivePhase(match, currentId, waitingPlayer) {
  if (match.phase === "match_over" || match.status === "completed" || match.status === "forfeited") {
    const winner = getLivePlayer(match.last_point_winner_id) || (match.score_a > match.score_b ? match.player_a : match.player_b);
    return `
      <div class="match-stage done">
        <div class="stage-kicker">Match beendet</div>
        <h2>${escapeHtml(winner?.display_name || "?")} gewinnt ${match.score_a}:${match.score_b}</h2>
        <p class="muted">${match.status === "forfeited" ? "Das Match wurde durch Timeout entschieden." : match.match_type === "quick" ? "Kurzspiel gespeichert. Rangliste und Statistik bleiben unverändert." : match.match_type === "tournament" ? "Turnierergebnis gespeichert. Der Sieger rückt weiter." : "Ergebnis gespeichert und Rangliste aktualisiert."}</p>
        <div class="btn-row"><button class="btn primary large" data-action="back-lobby">Zurück zur App</button></div>
      </div>`;
  }

  if (match.phase === "point_result") {
    return `
      <div class="match-stage result">
        <div class="stage-kicker">Punkt entschieden</div>
        <h2>${escapeHtml(match.last_point_text || "Punkt entschieden.")}</h2>
        <p class="muted">Beide Spieler sehen jetzt das Ergebnis dieses Ballwechsels. Danach startet der nächste Punkt.</p>
        <div class="btn-row"><button class="btn primary large" data-action="continue-live">Nächsten Punkt starten</button></div>
      </div>`;
  }

  const isMyTurn = match.waiting_for_player_id === currentId;
  if (!isMyTurn) {
    const remaining = secondsRemaining(match.action_deadline);
    return `
      <div class="match-stage waiting-stage">
        <div class="stage-kicker">Bitte warten</div>
        <h2>${escapeHtml(waitingPlayer?.display_name || "Gegner")} ist am Zug</h2>
        <p class="muted">Sobald die Eingabe gespeichert wurde, kannst du hier direkt weiterspielen.</p>
        <div class="waiting-meta-row">
          <span class="match-chip ${remaining <= 0 ? "danger" : "waiting"}">Restzeit: <strong id="deadlineCountdown">${formatSeconds(remaining)}</strong></span>
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
  return renderChoiceStage({
    kicker: match.is_second_serve ? "Zweiter Aufschlag" : "Erster Aufschlag",
    title: `${escapeHtml(getLivePlayer(match.waiting_for_player_id)?.display_name || "Du")} serviert`,
    description: "Wähle deinen Aufschlag. Der Gegner sieht deine Auswahl erst, nachdem er seinen Return gelesen hat.",
    inputId: "serveType",
    choices: SERVES,
    defaultChoiceId: SERVES[0]?.id,
    riskId: "serveRisk",
    riskDefault: 92,
    buttonLabel: "Aufschlag bestätigen",
    action: "submit-serve"
  });
}

function renderServeRead(match) {
  return renderChoiceStage({
    kicker: "Return",
    title: "Welchen Aufschlag erwartest du?",
    description: "Je genauer du den Aufschlag liest, desto stärker fällt dein Return aus.",
    inputId: "returnRead",
    choices: SERVES,
    defaultChoiceId: SERVES[0]?.id,
    riskId: "returnRisk",
    riskDefault: 82,
    buttonLabel: "Return spielen",
    action: "submit-return-read"
  });
}

function renderRallyAttack(match) {
  const activeSide = sideOf(match, match.active_player_id);
  const shots = availableShotsForLive(match, activeSide);
  const position = match.positions?.[activeSide] === "net" ? "am Netz" : "an der Grundlinie";
  return renderChoiceStage({
    kicker: `Ballwechsel · Schlag ${match.rally_count + 1}`,
    title: `${escapeHtml(getLivePlayer(match.active_player_id)?.display_name || "Du")} greift ${position} an`,
    description: "Wähle deinen Schlag. Der Gegner muss erraten, was du vorhast.",
    inputId: "rallyShot",
    choices: shots,
    defaultChoiceId: shots[0]?.id,
    riskId: "shotRisk",
    riskDefault: 88,
    buttonLabel: "Schlag spielen",
    action: "submit-rally-shot"
  });
}

function renderRallyRead(match) {
  const activeSide = sideOf(match, match.active_player_id);
  const shots = availableShotsForLive(match, activeSide);
  return renderChoiceStage({
    kicker: "Lesen & Reagieren",
    title: "Welchen Schlag erwartest du?",
    description: "Stell dich auf den wahrscheinlichsten Schlag ein. Ein guter Read bringt dir den Vorteil im Ballwechsel.",
    inputId: "rallyRead",
    choices: shots,
    defaultChoiceId: shots[0]?.id,
    riskId: "defenseRisk",
    riskDefault: 78,
    buttonLabel: "Reaktion bestätigen",
    action: "submit-rally-read"
  });
}

function renderChoiceStage({ kicker, title, description, inputId, choices, defaultChoiceId, riskId, riskDefault, buttonLabel, action }) {
  return `
    <div class="match-stage action-stage">
      <div class="stage-kicker">${kicker}</div>
      <h2>${title}</h2>
      <p class="muted">${description}</p>
      ${renderChoiceButtons(inputId, choices, defaultChoiceId)}
      ${renderRiskField(riskId, riskDefault)}
      <div class="btn-row stage-action-row">
        <button class="btn primary large" data-action="${action}">${buttonLabel}</button>
      </div>
    </div>`;
}

function renderChoiceButtons(inputId, choices, defaultChoiceId) {
  const normalized = (choices || []).map(choice => ({ id: choice.id, label: choice.label }));
  const defaultId = defaultChoiceId || normalized[0]?.id || "";
  return `
    <input type="hidden" id="${inputId}" value="${defaultId}" />
    <div class="shot-grid" data-choice-group="${inputId}">
      ${normalized.map(choice => `
        <button type="button" class="shot-option ${choice.id === defaultId ? "active" : ""}" data-choice-target="${inputId}" data-choice-value="${choice.id}">
          <span>${escapeHtml(choice.label)}</span>
        </button>`).join("")}
    </div>`;
}

function renderRiskField(id, value) {
  return `
    <label class="field risk-field-pro">
      <span>Risiko</span>
      <div class="risk-preset-row">
        <button type="button" class="risk-chip" data-risk-target="${id}" data-risk-value="70">Sicher</button>
        <button type="button" class="risk-chip" data-risk-target="${id}" data-risk-value="90">Normal</button>
        <button type="button" class="risk-chip" data-risk-target="${id}" data-risk-value="110">Mutig</button>
        <button type="button" class="risk-chip" data-risk-target="${id}" data-risk-value="130">All-In</button>
      </div>
      <div class="range-row pro-range-row">
        <input id="${id}" type="range" min="0" max="150" value="${value}" data-range-label="${id}Value" />
        <strong id="${id}Value" class="risk-value">${value}%</strong>
      </div>
    </label>`;
}

function syncChoiceButtons() {
  document.querySelectorAll('[data-choice-target]').forEach(button => {
    const target = button.dataset.choiceTarget;
    const input = document.getElementById(target);
    if (!input) return;
    button.classList.toggle('active', button.dataset.choiceValue === input.value);
  });
  document.querySelectorAll('[data-risk-target]').forEach(button => {
    const target = button.dataset.riskTarget;
    const input = document.getElementById(target);
    if (!input) return;
    button.classList.toggle('active', String(button.dataset.riskValue) === String(input.value));
  });
}

function renderPointLog(log) {
  if (!log?.length) return `<p class="muted small">Noch keine Aktion in diesem Punkt.</p>`;
  return `<ul class="log-list small">${log.slice().reverse().map(item => `<li class="log-item">${escapeHtml(item)}</li>`).join("")}</ul>`;
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

  if (form.classList.contains("rename-player-form")) {
    safeAction(async () => {
      const playerId = form.dataset.playerId;
      const input = form.querySelector("input");
      await state.store.renamePlayer(playerId, input.value);
      await refreshLobby(false);
      state.playerProfile = await state.store.getPlayerProfile(playerId);
      render();
      showToast("Spielername geändert.");
    });
  }

  if (form.id === "tournamentForm") {
    safeAction(async () => {
      await state.store.createTournament({
        name: document.getElementById("tournamentName").value,
        startsAt: localInputToIso(document.getElementById("tournamentStart").value),
        registrationDeadline: localInputToIso(document.getElementById("tournamentDeadline").value),
        maxPlayers: Number(document.getElementById("tournamentMaxPlayers").value)
      });
      await refreshLobby(false);
      render();
      showToast("Turnier erstellt.");
    });
  }
});

app.addEventListener("click", event => {
  const button = event.target.closest("[data-action], [data-choice-target], [data-risk-target]");
  if (!button) return;

  const action = button.dataset.action;
  const playerId = button.dataset.playerId;
  const challengeId = button.dataset.challengeId;
  const liveMatchId = button.dataset.liveMatchId;
  const tournamentId = button.dataset.tournamentId;
  const tournamentMatchId = button.dataset.tournamentMatchId;

  if (button.dataset.choiceTarget) {
    const input = document.getElementById(button.dataset.choiceTarget);
    if (input) {
      input.value = button.dataset.choiceValue || "";
      syncChoiceButtons();
    }
    return;
  }

  if (button.dataset.riskTarget) {
    const input = document.getElementById(button.dataset.riskTarget);
    if (input) {
      input.value = button.dataset.riskValue || input.value;
      syncRangeLabels();
      syncChoiceButtons();
    }
    return;
  }

  safeAction(async () => {
    if (action === "refresh" || action === "refresh-public") {
      await refreshLobby(true);
      if (state.lobbyPage === "profile" && state.selectedProfileId) {
        state.playerProfile = await state.store.getPlayerProfile(state.selectedProfileId);
      }
      render();
    }

    if (action === "set-page") {
      state.lobbyPage = button.dataset.page || "start";
      if (state.lobbyPage === "profile") {
        state.selectedProfileId = state.session?.player?.id || null;
        state.playerProfile = state.selectedProfileId ? await state.store.getPlayerProfile(state.selectedProfileId) : null;
      } else {
        state.playerProfile = null;
      }
      render();
    }

    if (action === "enter-public-app") {
      state.publicEntered = true;
      render();
    }

    if (action === "back-public-landing") {
      state.publicEntered = false;
      render();
    }

    if (action === "enter-public-ranking") {
      state.publicEntered = true;
      render();
      window.setTimeout(() => document.getElementById("publicRankingSection")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }

    if (action === "scroll-login") {
      document.getElementById("publicAuthSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (action === "scroll-ranking") {
      document.getElementById("publicRankingSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (action === "scroll-tournaments") {
      document.getElementById("publicTournamentsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }


    if (action === "open-profile") {
      state.selectedProfileId = playerId || state.session?.player?.id;
      state.playerProfile = await state.store.getPlayerProfile(state.selectedProfileId);
      state.lobbyPage = "profile";
      state.view = "lobby";
      render();
    }

    if (action === "prompt-rename-player") {
      const currentName = button.dataset.playerName || "";
      const newName = window.prompt("Neuer Spielername", currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        await state.store.renamePlayer(playerId, newName.trim());
        await refreshLobby(false);
        render();
        showToast("Spielername geändert.");
      }
    }

    if (action === "logout") {
      clearSession();
      state.publicEntered = false;
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

    if (action === "join-tournament") {
      await state.store.joinTournament(tournamentId);
      await refreshLobby(false);
      render();
      showToast("Für das Turnier angemeldet.");
    }

    if (action === "leave-tournament") {
      await state.store.leaveTournament(tournamentId);
      await refreshLobby(false);
      render();
      showToast("Vom Turnier abgemeldet.");
    }

    if (action === "generate-tournament") {
      await state.store.generateTournamentBracket(tournamentId);
      await refreshLobby(false);
      render();
      showToast("Tableau generiert.");
    }

    if (action === "cancel-tournament") {
      await state.store.cancelTournament(tournamentId);
      await refreshLobby(false);
      render();
      showToast("Turnier abgesagt.");
    }

    if (action === "start-tournament-match") {
      state.liveMatch = await state.store.startTournamentMatch(tournamentMatchId);
      state.view = "live";
      render();
      showToast("Turniermatch gestartet.");
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
