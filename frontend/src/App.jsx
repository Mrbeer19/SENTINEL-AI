import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { request, useLiveData } from "./api.js";
import { Icon } from "./ui.jsx";
import { date, time, sourcesOf, kind, incidentId } from "./lib.js";
import PosterGlobe from "./PosterGlobe.jsx";
import PosterOverview from "./PosterOverview.jsx";
import SentinelLogo from "./SentinelLogo.jsx";
import { ConnectionLoader, PageSkeleton } from "./PosterLoading.jsx";
import { RefreshMotion } from "./motion.jsx";
import AutoBlockAlerts from "./AutoBlockAlerts.jsx";
import AskPanel from "./AskPanel.jsx";
import {
  Approvals,
  ApprovalWave,
  Incident,
  Incidents,
  Reports,
  Rules,
  Trace,
  titles,
} from "./PosterPages.jsx";

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("sentinel-observatory-theme", theme);
    } catch {}
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
export default function App() {
  const [theme, toggle] = useTheme(),
    [session, setSession] = useState(null),
    [user, setUser] = useState("admin"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const check = useCallback(async () => {
    setBusy(true);
    try {
      setSession((await request("/api/auth/session")).data);
      setError("");
      setOffline(false);
    } catch {
      setSession({ authenticated: false });
      setOffline(true);
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ เปิด Backend แล้วลองใหม่");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    check();
    const expired = () => {
      setSession({ authenticated: false, configured: true });
      setError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    };
    window.addEventListener("sentinel-auth-expired", expired);
    return () => window.removeEventListener("sentinel-auth-expired", expired);
  }, [check]);
  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/login", {
        method: "POST",
        body: { username: user, password },
      });
      setPassword("");
      await check();
    } catch (err) {
      if (err.status === 0) setOffline(true);
      setError(
        err.status === 0
          ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"
          : err.status === 429
            ? "ลองหลายครั้งเกินไป กรุณารอสักครู่"
            : err.status === 503
              ? "ยังไม่ได้ตั้งค่าบัญชีแอดมินที่เซิร์ฟเวอร์"
              : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
      );
      setPassword("");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    try {
      await request("/api/auth/logout", { method: "POST", body: {} });
      setSession({ authenticated: false, configured: true });
    } catch {
      setError("ออกจากระบบไม่สำเร็จ ลองอีกครั้ง");
    }
  };
  if (session === null)
    return (
      <div className="authLoader">
        <ConnectionLoader />
      </div>
    );
  if (session?.authenticated)
    return (
      <Workspace
        theme={theme}
        toggleTheme={toggle}
        user={session.username || user}
        onLogout={logout}
        authError={error}
      />
    );
  return (
    <div className="loginPage">
      <PosterGlobe page="login" />
      <a className="posterLoginBrand" href="/">
        <SentinelLogo />
      </a>
      <section className="posterLoginHero">
        <strong>SECURE</strong>
        <span>ACCESS</span>
        <i>/////</i>
        <p>ศูนย์ควบคุมความปลอดภัย</p>
      </section>
      <div className="posterLoginCard">
        <form onSubmit={login} className="loginForm">
          <a href="/" className="brand">
            <SentinelLogo />
          </a>
          <h2>Sign in</h2>
          <p>ใช้บัญชีแอดมินเดิมของ Sentinel เพื่อเข้าพื้นที่ทำงานความปลอดภัย</p>
          <label className="field">
            ชื่อผู้ใช้
            <span className="inputWrap">
              <Icon name="user" size={16} />
              <input
                value={user}
                maxLength="100"
                autoComplete="username"
                required
                onChange={(e) => setUser(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            รหัสผ่าน
            <span className="inputWrap">
              <Icon name="lock" size={16} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                maxLength="1024"
                autoComplete="current-password"
                required
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="revealButton"
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" className="notice bad">
              {error}
            </p>
          )}
          {session?.configured === false && (
            <p className="notice">ยังไม่ได้ตั้งค่ารหัสแอดมินบนเซิร์ฟเวอร์</p>
          )}
          <button
            className="button primary"
            disabled={busy || session?.configured === false}
          >
            {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
            <Icon name="arrow" size={17} />
          </button>
          {offline && (
            <button
              type="button"
              className="textButton"
              disabled={busy}
              onClick={check}
            >
              ลองเชื่อมต่อเซิร์ฟเวอร์ใหม่
            </button>
          )}
          <span className="loginDivider">
            <Icon name="lock" size={12} />
            AUTHORIZED PERSONNEL ONLY
          </span>
          <small>
            การยืนยันตัวตนตรวจที่ Backend ไม่ได้บันทึกรหัสในหน้าเว็บ
          </small>
        </form>
      </div>
    </div>
  );
}
const nav = [
  ["overview", "Overview", "overview"],
  ["incidents", "Incidents", "incident"],
  ["trace", "AI investigation", "trace"],
  ["approvals", "Approvals", "check"],
  ["rules", "Protection", "shield"],
  ["reports", "Reports", "report"],
];
function ago(at, now) {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  return s < 5
    ? "เมื่อสักครู่"
    : s < 60
      ? `${s} วินาทีที่แล้ว`
      : `${Math.round(s / 60)} นาทีที่แล้ว`;
}
function routeOf() {
  const [p = "overview", id] = location.hash
    .replace(/^#\/?/, "")
    .split("?")[0]
    .split("/");
  return {
    page: titles[p] ? p : "overview",
    id: /^\d+$/.test(id || "") ? Number(id) : null,
    query: location.hash.split("?")[1] || "",
  };
}
export function Workspace({
  theme,
  toggleTheme,
  user,
  onLogout,
  authError = "",
  fixture = false,
}) {
  const [route, setRoute] = useState(routeOf),
    live = useLiveData(),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [askEnabled, setAskEnabled] = useState(false),
    [askOpen, setAskOpen] = useState(false),
    [askThinking, setAskThinking] = useState(false),
    lock = useRef(false),
    toastTimer = useRef(null),
    routeRef = useRef(route);
  const globeRef = useRef(null);
  const [overviewView, setOverviewView] = useState("globe");
  const [selectedIp, setSelectedIp] = useState(null),
    [locations, setLocations] = useState({}),
    [zoomed, setZoomed] = useState(false);
  const sourceRows = useMemo(
    () =>
      sourcesOf(live.data).map((s) => ({
        ...s,
        incident: live.data.incidents.find((i) => i.source_ip === s.ip),
      })),
    [live.data],
  );
  const initialSource = useRef(false);
  const [globeSourceIps, setGlobeSourceIps] = useState(null);
  useEffect(() => {
    if (!initialSource.current && sourceRows.length) {
      initialSource.current = true;
      const pending = live.data.proposals.find((p) => p.status === "pending");
      setSelectedIp(
        pending?.target_ip ||
          pending?.source_ip ||
          live.data.incidents[0]?.source_ip ||
          sourceRows[0].ip,
      );
    } else if (selectedIp && !sourceRows.some((s) => s.ip === selectedIp))
      setSelectedIp(null);
  }, [sourceRows, selectedIp]);
  useEffect(() => {
    document
      .querySelectorAll(".fadeOnZoom,.pageHeading,.nFooter")
      .forEach((node) => {
        node.inert = zoomed;
      });
  }, [zoomed]);
  useEffect(() => {
    let alive = true;
    request("/api/rag", { accept: [404] })
      .then(({ data }) => alive && setAskEnabled(Boolean(data?.enabled)))
      .catch(() => alive && setAskEnabled(false));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const change = () => {
      const nextRoute = routeOf();
      const go = () => {
        if (routeRef.current.page !== nextRoute.page) setToast(null);
        routeRef.current = nextRoute;
        setRoute(nextRoute);
      };
      go();
    };
    window.addEventListener("hashchange", change);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("hashchange", change);
      clearInterval(timer);
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    document.querySelector("#workspace")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route.page]);
  const act = useCallback(
    async (path, { method = "POST", body = {} } = {}) => {
      if (lock.current) return null;
      lock.current = true;
      setBusy(true);
      let toastLifetime = 8000;
      try {
        const result = await request(path, {
          method,
          body: method === "DELETE" ? undefined : body,
        });
        setToast({
          message: path.endsWith("/approve")
            ? "บล็อก IP สำเร็จ"
            : path.endsWith("/acknowledge")
              ? "รับทราบการบล็อกอัตโนมัติแล้ว"
              : "บันทึกการดำเนินการแล้ว",
          type: "good",
          approved: path.endsWith("/approve"),
        });
        if (path.endsWith("/approve")) toastLifetime = 2500;
        await live.refresh(true);
        return result;
      } catch (err) {
        setToast({
          message:
            err.status === 409
              ? "รายการเปลี่ยนไปแล้ว กำลังโหลดสถานะล่าสุด"
              : err.status === 403
                ? "ไม่มีสิทธิ์ดำเนินการ"
                : err.status === 400 || err.status === 422
                  ? "ข้อมูลไม่ผ่านนโยบาย กรุณาตรวจเป้าหมายและข้อมูลอีกครั้ง"
                  : "ดำเนินการไม่สำเร็จ ตรวจการเชื่อมต่อและลองใหม่",
          detail: err.message,
          type: "bad",
        });
        if (err.status === 409) await live.refresh(true);
        return null;
      } finally {
        lock.current = false;
        setBusy(false);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), toastLifetime);
      }
    },
    [live.refresh],
  );
  const ctx = {
      ...live,
      now,
      user,
      busy,
      act,
      searchQuery: "",
      selectedIp,
      setSelectedIp,
      locations,
      globeRef,
      routeQuery: route.query,
      setOverviewView,
      setGlobeSourceIps,
    },
    [title, subtitle] = titles[route.page],
    active = route.page === "incident" ? "incidents" : route.page;
  return (
    <div
      className="nShell posterShell"
      data-page={route.page}
      data-zoomed={zoomed || undefined}
      data-ask-open={askOpen || undefined}
    >
      <PosterGlobe
        ref={globeRef}
        page={
          route.page === "overview" && overviewView !== "globe"
            ? overviewView
            : route.page
        }
        sources={
          route.page === "overview" && globeSourceIps
            ? sourceRows.filter((s) => globeSourceIps.includes(s.ip))
            : sourceRows
        }
        selectedIp={selectedIp}
        onSelect={setSelectedIp}
        onZoom={setZoomed}
        onLocations={setLocations}
      />
      <a
        className="skipLink"
        href="#workspace"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("workspace")?.focus();
        }}
      >
        ข้ามไปเนื้อหา
      </a>
      <header className="nHeader posterHeader">
        <a className="brand" href="#/overview">
          <SentinelLogo />
        </a>
        <nav className="posterMainNav" aria-label="เมนูหลัก">
          {nav.map(([key, label]) => (
            <a
              key={key}
              href={`#/${key}`}
              aria-current={active === key ? "page" : undefined}
            >
              {key === "trace" ? "AI" : label}
              {key === "approvals" && (
                <b>
                  {
                    live.data.proposals.filter((p) => p.status === "pending")
                      .length
                  }
                </b>
              )}
            </a>
          ))}
        </nav>
        <div className="posterHeaderStatus">
          <span className="posterPill">
            <i
              className={`dot ${live.error ? "red" : live.connected ? "" : "amber"}`}
            />
            {live.error
              ? "Offline"
              : live.connected
                ? "Connected"
                : "Reconnecting"}
          </span>
          <span className="posterPill">
            <i
              className={`dot ${live.data.health?.model_ready ? "" : "amber"}`}
            />
            AI {live.data.health?.model_ready ? "online" : "offline"}
          </span>
        </div>
        <details className="posterAccount">
          <summary>
            <Icon name="user" /> {user}⌄
          </summary>
          <button className="button" onClick={onLogout}>
            ออกจากระบบ
          </button>
        </details>
      </header>
      <main id="workspace" tabIndex="-1">
        <div className="pageHeading">
          <div>
            <span className="eyebrow pageBreadcrumb">
              Workspace <span>/</span> {nav.find((n) => n[0] === active)?.[1]}
            </span>
            <h1>
              <strong>
                {
                  {
                    overview: "SECURITY",
                    incidents: "SECURITY",
                    incident:
                      kind(
                        live.data.incidents.find((i) => i.id === route.id)
                          ?.kind,
                      ) || "INCIDENT",
                    trace: "RULE / AI",
                    approvals: "RESPONSE",
                    rules: "WEB",
                    reports: "SECURITY",
                  }[route.page]
                }
              </strong>
              <span>
                {
                  {
                    overview: "OVERVIEW",
                    incidents: "INCIDENTS",
                    incident: incidentId(route.id),
                    trace: "INVESTIGATION",
                    approvals: "APPROVALS",
                    rules: "PROTECTION",
                    reports: "REPORTS",
                  }[route.page]
                }
              </span>
              <i aria-hidden="true">/////</i>
            </h1>
            <p>{subtitle}</p>
          </div>
          {route.page === "approvals" && (
            <ApprovalWave events={live.data.events} />
          )}
          <div className="pageActions">
            {live.updatedAt && (
              <span
                className="freshness"
                title={`อัปเดตล่าสุด ${time(live.updatedAt)}`}
              >
                <i className="dot" aria-hidden="true" />
                อัปเดต {ago(live.updatedAt, now)}
              </span>
            )}
            <time>
              {new Date(now).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </time>
            <button
              className="button compact"
              disabled={live.refreshing}
              onClick={() => live.refresh(true)}
              aria-label="รีเฟรชข้อมูล"
            >
              <RefreshMotion busy={live.refreshing}>
                <Icon name="refresh" size={14} />
              </RefreshMotion>
              {live.refreshing ? "กำลังโหลด" : "รีเฟรช"}
            </button>
          </div>
        </div>
        {(live.error || authError) && (
          <div
            role="alert"
            className={`notice bad ${live.error ? "connectionNotice" : ""}`}
          >
            <span>{authError || "เชื่อมต่อ server ไม่ได้ กำลังลองใหม่"}</span>
            <button className="button" onClick={() => live.refresh(true)}>
              ลองใหม่
            </button>
          </div>
        )}
        {!live.loading && live.data.health && <AutoBlockAlerts ctx={ctx} />}
        <div key={route.page} className="pageContent">
          {live.loading ? (
            <PageSkeleton />
          ) : !live.data.health ? (
            <div className="empty">
              ยังไม่มีข้อมูลที่แสดงได้ กรุณาตรวจการเชื่อมต่อ
            </div>
          ) : route.page === "overview" ? (
            <PosterOverview ctx={ctx} />
          ) : route.page === "incidents" ? (
            <Incidents ctx={ctx} />
          ) : route.page === "incident" ? (
            <Incident ctx={ctx} id={route.id} />
          ) : route.page === "trace" ? (
            <Trace ctx={ctx} id={route.id} />
          ) : route.page === "approvals" ? (
            <Approvals ctx={ctx} id={route.id} />
          ) : route.page === "rules" ? (
            <Rules ctx={ctx} id={route.id} />
          ) : (
            <Reports ctx={ctx} id={route.id} />
          )}
        </div>
        <footer className="nFooter">
          <span>SENTINEL / SECURITY WORKSPACE</span>
          <span>
            {fixture
              ? "ข้อมูลสังเคราะห์ · ไม่เชื่อมระบบจริง"
              : "Human approved response · rule auto-block for decoy, scanner paths, critical flood · App-level protection"}
          </span>
        </footer>
      </main>
      {askEnabled && (
        <AskPanel
          open={askOpen}
          onClose={() => setAskOpen(false)}
          incidents={live.data.incidents}
          route={route}
          user={user}
          onThinking={setAskThinking}
        />
      )}
      {askEnabled && !askOpen && (
        <button
          type="button"
          className="askLauncher"
          onClick={() => setAskOpen(true)}
          aria-label="เปิด Ask me ถามเรื่อง incident"
        >
          <span className="askLauncherDot" aria-hidden="true" />
          Ask me
        </button>
      )}
      {(busy || toast) && (
        <div
          className={`toast ${toast?.type || ""} ${!busy && toast?.approved ? "mascotToast" : ""}`}
          role="status"
        >
          <Icon
            name={
              busy ? "clock" : toast?.type === "good" ? "check" : "incident"
            }
          />
          <span>
            {busy ? "กำลังบันทึก…" : toast.message}
            {!busy && toast?.approved && (
              <small>เว็บที่ป้องกันจะตอบ 403 กับ IP นี้</small>
            )}
            {toast?.detail && (
              <details>
                <summary>รายละเอียด</summary>
                {toast.detail}
              </details>
            )}
          </span>
          {!busy && (
            <button onClick={() => setToast(null)} aria-label="ปิดแจ้งเตือน">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
