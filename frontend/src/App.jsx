import React, { useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:8086/ws";
const TOKEN_KEY = "tinder_mvp_token";
const USER_KEY = "tinder_mvp_user";

function authHeaders(token, extra = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [userId, setUserId] = useState(localStorage.getItem(USER_KEY) || "");
  const [authMode, setAuthMode] = useState("login");
  const [registerStep, setRegisterStep] = useState(1);
  const [authError, setAuthError] = useState("");
  const [peopleCount, setPeopleCount] = useState(0);
  const [activeTab, setActiveTab] = useState("explore");

  const [profile, setProfile] = useState(null);
  const [profileDraft, setProfileDraft] = useState({
    name: "",
    age: "",
    gender: "",
    interested_in: "",
    location_cell: "",
    bio: ""
  });
  const [recommendations, setRecommendations] = useState([]);
  const [recIndex, setRecIndex] = useState(0);
  const [matches, setMatches] = useState([]);
  const [matchFilter, setMatchFilter] = useState("");
  const [selectedMatch, setSelectedMatch] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [photos, setPhotos] = useState([]);
  const [profileStatus, setProfileStatus] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "alex@demo.app", password: "demo123" });
  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    name: "",
    age: "",
    gender: "",
    interested_in: "",
    location_cell: "",
    bio: ""
  });

  const wsRef = useRef(null);

  const isAuthed = Boolean(token && userId);
  const activeRecommendation = recommendations[recIndex] || null;
  const nextRecommendation = recommendations[recIndex + 1] || null;

  const filteredMatches = useMemo(() => {
    const q = matchFilter.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m) => m.toLowerCase().includes(q));
  }, [matches, matchFilter]);

  useEffect(() => {
    fetchPeopleCount();
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    bootstrapAuthed().catch((error) => setAuthError(error.message));
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) return;
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [isAuthed, userId, selectedMatch]);

  useEffect(() => {
    if (!isAuthed || !selectedMatch) return;
    loadHistory(selectedMatch).catch(() => {});
  }, [selectedMatch]);

  async function fetchPeopleCount() {
    try {
      const data = await api("/auth/people");
      setPeopleCount(data.total_count || data.items?.length || 0);
    } catch {
      setPeopleCount(0);
    }
  }

  async function bootstrapAuthed() {
    await Promise.all([refreshProfile(), refreshRecommendations(), refreshMatches(), refreshPhotos()]);
  }

  async function refreshProfile() {
    const data = await api("/profile/me", { headers: authHeaders(token) });
    setProfile(data);
    setProfileDraft({
      name: data.name || "",
      age: data.age || "",
      gender: data.gender || "",
      interested_in: data.interested_in || "",
      location_cell: data.location_cell || "",
      bio: data.bio || ""
    });
    setUserId(data.user_id);
    localStorage.setItem(USER_KEY, data.user_id);
  }

  async function refreshRecommendations() {
    const data = await api("/recommendations?limit=30", { headers: authHeaders(token) });
    setRecommendations(data.items || []);
    setRecIndex(0);
  }

  async function refreshMatches() {
    const data = await api("/matches", { headers: authHeaders(token) });
    const list = data.matches || [];
    setMatches(list);
    if (!selectedMatch && list.length) setSelectedMatch(list[0]);
  }

  async function refreshPhotos() {
    const data = await api("/images", { headers: authHeaders(token) });
    setPhotos(data.items || []);
  }

  async function loadHistory(otherUserId) {
    if (!otherUserId) {
      setMessages([]);
      return;
    }
    const data = await api(`/chat/history/${encodeURIComponent(otherUserId)}`, { headers: authHeaders(token) });
    setMessages(data.items || []);
  }

  function connectWs() {
    if (!userId) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    wsRef.current = new WebSocket(`${WS_BASE}?user_id=${encodeURIComponent(userId)}`);
    wsRef.current.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (
        payload.type === "message" &&
        selectedMatch &&
        (payload.from_user_id === selectedMatch || payload.to_user_id === selectedMatch)
      ) {
        loadHistory(selectedMatch).catch(() => {});
      }
    };
  }

  function saveAuth(nextToken, nextUserId) {
    setToken(nextToken);
    setUserId(nextUserId);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, nextUserId);
    setAuthError("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    try {
      const data = await api("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      saveAuth(data.token, data.user_id);
    } catch (error) {
      setAuthError(error.message);
    }
  }

  function validateRegisterStep(step) {
    if (step === 1) return Boolean(registerForm.email.trim());
    if (step === 2) return registerForm.password.trim().length >= 6;
    if (step === 3) return Boolean(registerForm.name.trim() && registerForm.age);
    if (step === 4) return Boolean(registerForm.gender.trim() && registerForm.location_cell.trim());
    return false;
  }

  async function handleRegister(event) {
    event.preventDefault();
    try {
      const payload = {
        ...registerForm,
        age: Number(registerForm.age),
        email: registerForm.email.trim(),
        name: registerForm.name.trim(),
        gender: registerForm.gender.trim(),
        interested_in: registerForm.interested_in.trim(),
        location_cell: registerForm.location_cell.trim(),
        bio: registerForm.bio.trim()
      };
      const data = await api("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      saveAuth(data.token, data.user_id);
      setRegisterStep(1);
    } catch (error) {
      setAuthError(error.message);
    }
  }

  function logout() {
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    setToken("");
    setUserId("");
    setProfile(null);
    setRecommendations([]);
    setRecIndex(0);
    setMatches([]);
    setSelectedMatch("");
    setMessages([]);
    setPhotos([]);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setActiveTab("explore");
    fetchPeopleCount();
  }

  async function swipe(direction) {
    if (!activeRecommendation) return;
    const result = await api("/swipes", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ to_user_id: activeRecommendation.user_id, direction })
    });

    const nextIndex = recIndex + 1;
    setRecIndex(nextIndex);

    if (result.matched) {
      await refreshMatches();
      setActiveTab("matches");
    }
  }

  async function sendMessage() {
    const text = messageText.trim();
    if (!text || !selectedMatch || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "send_message",
        to_user_id: selectedMatch,
        body: text
      })
    );

    setMessageText("");
    setTimeout(() => loadHistory(selectedMatch).catch(() => {}), 200);
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!profile) return;

    const payload = {
      name: String(profileDraft.name || "").trim(),
      age: Number(profileDraft.age || 0),
      gender: String(profileDraft.gender || "").trim(),
      interested_in: String(profileDraft.interested_in || "").trim(),
      location_cell: String(profileDraft.location_cell || "").trim(),
      bio: String(profileDraft.bio || "").trim()
    };

    const updated = await api("/profile/me", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(payload)
    });

    setProfile(updated);
    setProfileStatus("Profile saved");
    setTimeout(() => setProfileStatus(""), 1200);
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const contentBase64 = await fileToBase64(file);
    await api("/images", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        filename: file.name,
        mime_type: file.type || "image/jpeg",
        content_base64: contentBase64
      })
    });

    event.target.value = "";
    refreshPhotos();
  }

  const completion = profile ? profileCompletion(profile) : 0;

  return (
    <div className="page-root">
      <header className="topbar">
        <div className="brand">tinder</div>
        {isAuthed ? (
          <button className="ghost-btn" onClick={logout}>
            Sign out
          </button>
        ) : null}
      </header>

      {!isAuthed ? (
        <main className="auth-screen">
          <section className="auth-card">
            <h1>{authMode === "login" ? "Login" : "Create profile"}</h1>
            <p>Find people nearby with premium-light UI</p>

            <div className="auth-tabs">
              <button
                className={`pill-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={`pill-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setRegisterStep(1);
                }}
                type="button"
              >
                Sign up
              </button>
            </div>

            {authMode === "login" ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <label>
                  Email
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    required
                  />
                </label>
                <button type="submit" className="grad-btn">
                  Log in
                </button>
                <div className="hint">Demo: alex@demo.app / demo123</div>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleRegister}>
                <div className="step-caption">Step {registerStep} of 4</div>

                {registerStep === 1 ? (
                  <label>
                    Email
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                  </label>
                ) : null}

                {registerStep === 2 ? (
                  <label>
                    Password
                    <input
                      type="password"
                      minLength={6}
                      value={registerForm.password}
                      onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                      required
                    />
                  </label>
                ) : null}

                {registerStep === 3 ? (
                  <div className="grid-two">
                    <label>
                      Name
                      <input
                        value={registerForm.name}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Age
                      <input
                        type="number"
                        min={18}
                        max={99}
                        value={registerForm.age}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, age: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                ) : null}

                {registerStep === 4 ? (
                  <>
                    <div className="grid-two">
                      <label>
                        Gender
                        <input
                          placeholder="woman / man"
                          value={registerForm.gender}
                          onChange={(event) => setRegisterForm((prev) => ({ ...prev, gender: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        Interested in
                        <input
                          placeholder="man / woman"
                          value={registerForm.interested_in}
                          onChange={(event) =>
                            setRegisterForm((prev) => ({ ...prev, interested_in: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Location cell
                      <input
                        placeholder="sf-1"
                        value={registerForm.location_cell}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, location_cell: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Bio
                      <textarea
                        rows={2}
                        value={registerForm.bio}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, bio: event.target.value }))}
                      />
                    </label>
                  </>
                ) : null}

                <div className="step-actions">
                  {registerStep > 1 ? (
                    <button type="button" className="ghost-btn" onClick={() => setRegisterStep((s) => s - 1)}>
                      Back
                    </button>
                  ) : null}

                  {registerStep < 4 ? (
                    <button
                      type="button"
                      className="grad-btn"
                      onClick={() => {
                        if (!validateRegisterStep(registerStep)) {
                          setAuthError("Fill required fields for this step");
                          return;
                        }
                        setAuthError("");
                        setRegisterStep((s) => s + 1);
                      }}
                    >
                      Next
                    </button>
                  ) : (
                    <button type="submit" className="grad-btn">
                      Create profile
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="profiles-count">
              <span>Profiles in app</span>
              <strong>{peopleCount}</strong>
            </div>
            <div className="error-text">{authError}</div>
          </section>
        </main>
      ) : (
        <main className="app-screen">
          {activeTab === "explore" ? (
            <section className="screen">
              <div className="profile-chip">
                <div className="ring">{completion}%</div>
                <div>
                  <h2>{profile?.name || userId}</h2>
                  <p>
                    {profile?.age || "?"} • {profile?.location_cell || "unknown"}
                  </p>
                </div>
              </div>

              <div className="deck">
                {nextRecommendation ? <ProfileCard profile={nextRecommendation} className="back" /> : null}
                {activeRecommendation ? <ProfileCard profile={activeRecommendation} /> : <EmptyDeck />}
              </div>

              <div className="swipe-actions">
                <button className="action-btn no" onClick={() => swipe("left")}>
                  Pass
                </button>
                <button className="action-btn yes" onClick={() => swipe("right")}>
                  Like
                </button>
              </div>
            </section>
          ) : null}

          {activeTab === "matches" ? (
            <section className="screen chat-screen">
              <aside className="matches-sidebar glass">
                <div className="search-wrap">
                  <input
                    placeholder="Search matches"
                    value={matchFilter}
                    onChange={(event) => setMatchFilter(event.target.value)}
                  />
                </div>
                <div className="matches-list">
                  {filteredMatches.length ? (
                    filteredMatches.map((matchId) => (
                      <button
                        key={matchId}
                        className={`match-row ${selectedMatch === matchId ? "active" : ""}`}
                        onClick={() => setSelectedMatch(matchId)}
                      >
                        <span className="avatar">{(matchId[0] || "U").toUpperCase()}</span>
                        <span className="match-copy">
                          <strong>{matchId}</strong>
                          <small>Say hello and keep it simple.</small>
                        </span>
                        <span className="badge">•</span>
                      </button>
                    ))
                  ) : (
                    <div className="empty-matches">No matches yet</div>
                  )}
                </div>
              </aside>

              <section className="chat-panel glass">
                <header className="chat-header">
                  <div className="chat-user">
                    <span className="avatar lg">{(selectedMatch?.[0] || "?").toUpperCase()}</span>
                    <div>
                      <strong>{selectedMatch || "Select a match"}</strong>
                      <small>{selectedMatch ? "online" : "Choose someone to start chat"}</small>
                    </div>
                  </div>
                  <div className="chat-icons">
                    <button>⌕</button>
                    <button>i</button>
                    <button>⋯</button>
                  </div>
                </header>

                <div className="chat-messages">
                  {selectedMatch ? (
                    messages.length ? (
                      messages.map((message) => {
                        const mine = message.from_user_id === userId;
                        return (
                          <div key={message.message_id} className={`bubble-row ${mine ? "mine" : "theirs"}`}>
                            {!mine ? <span className="avatar sm">{selectedMatch[0].toUpperCase()}</span> : null}
                            <div className="bubble-wrap">
                              <div className={`bubble ${mine ? "mine" : "theirs"}`}>{message.body}</div>
                              <small>{formatTime(message.sent_at)}</small>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="chat-empty">Say hi and start the conversation</div>
                    )
                  ) : (
                    <div className="chat-empty">Choose a match to start chat</div>
                  )}
                </div>

                <footer className="chat-composer">
                  <span className="compose-icon">＋</span>
                  <input
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") sendMessage();
                    }}
                  />
                  <button onClick={sendMessage}>Send</button>
                </footer>
              </section>
            </section>
          ) : null}

          {activeTab === "profile" ? (
            <section className="screen profile-screen">
              <form className="profile-form glass" onSubmit={saveProfile}>
                <div className="grid-two">
                  <label>
                    Name
                    <input
                      name="name"
                      value={profileDraft.name}
                      onChange={(event) => setProfileDraft((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Age
                    <input
                      name="age"
                      type="number"
                      min={18}
                      max={99}
                      value={profileDraft.age}
                      onChange={(event) => setProfileDraft((prev) => ({ ...prev, age: event.target.value }))}
                      required
                    />
                  </label>
                </div>
                <div className="grid-two">
                  <label>
                    Gender
                    <input
                      name="gender"
                      value={profileDraft.gender}
                      onChange={(event) => setProfileDraft((prev) => ({ ...prev, gender: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Interested in
                    <input
                      name="interested_in"
                      value={profileDraft.interested_in}
                      onChange={(event) =>
                        setProfileDraft((prev) => ({ ...prev, interested_in: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Location cell
                  <input
                    name="location_cell"
                    value={profileDraft.location_cell}
                    onChange={(event) => setProfileDraft((prev) => ({ ...prev, location_cell: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Bio
                  <textarea
                    name="bio"
                    rows={3}
                    value={profileDraft.bio}
                    onChange={(event) => setProfileDraft((prev) => ({ ...prev, bio: event.target.value }))}
                  />
                </label>
                <button className="grad-btn" type="submit">
                  Save profile
                </button>
                <div className="hint">{profileStatus}</div>
              </form>

              <section className="photos-panel glass">
                <label className="upload-pill">
                  <input type="file" accept="image/*" onChange={uploadPhoto} />
                  Upload photo
                </label>
                <div className="photos-grid">
                  {photos.length ? (
                    photos.map((photo) => <img key={photo.image_id} src={photo.object_url} alt="profile" loading="lazy" />)
                  ) : (
                    <div className="hint">No photos yet</div>
                  )}
                </div>
              </section>
            </section>
          ) : null}
        </main>
      )}

      {isAuthed ? (
        <nav className="bottom-nav">
          <button className={activeTab === "explore" ? "active" : ""} onClick={() => setActiveTab("explore")}>
            Discover
          </button>
          <button className={activeTab === "matches" ? "active" : ""} onClick={() => setActiveTab("matches")}>
            Matches
          </button>
          <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>
            Profile
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function profileCompletion(profile) {
  const values = [profile.name, profile.age, profile.gender, profile.interested_in, profile.location_cell, profile.bio];
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function ProfileCard({ profile, className = "" }) {
  const photo = `https://picsum.photos/seed/${encodeURIComponent(profile.user_id || profile.name)}/900/1300`;
  return (
    <article className={`profile-card ${className}`}>
      <img src={photo} alt={profile.name} loading="lazy" />
      <div className="overlay" />
      <div className="copy">
        <h3>
          {profile.name}, {profile.age}
        </h3>
        <p>
          {profile.location_cell} • {profile.gender}
        </p>
        <small>{(profile.bio || "").slice(0, 72)}</small>
      </div>
    </article>
  );
}

function EmptyDeck() {
  return (
    <article className="profile-card empty">
      <div className="copy center">
        <h3>All caught up</h3>
        <p>Come back later for fresh recommendations.</p>
      </div>
    </article>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
