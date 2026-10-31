import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { request, useLiveData } from "./api.js";
import { Icon } from "./ui.jsx";
import { date, time } from "./lib.js";
import SentinelLogo from "./SentinelLogo.jsx";
import Mascot, { ConnectionLoader } from "./Mascot.jsx";
import { RefreshMotion, useNavIndicator } from "./motion.jsx";
import {
  Approvals,
  Incident,
  Incidents,
  Overview,
  Reports,
  Rules,
  Trace,
  titles,
} from "./Pages.jsx";

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("sentinel-observatory-theme") || "dark";
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
    [offline, setOffline] = useState(false);
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
  if (session === null) return <div className="authLoader"><ConnectionLoader /></div>;
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
      <button className="themeButton" onClick={toggle} aria-label="สลับธีม">
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>
      <section className="loginArt">
        <a href="/" className="brand">
          <SentinelLogo />
        </a>
        <span className="eyebrow">SECURITY OBSERVATORY / 02</span>
        <h1>
          See the signal.
          <br />
          <em>Own the response.</em>
        </h1>
        <p>
          เฝ้าระวัง วิเคราะห์ และควบคุมการป้องกัน
          <br />
          จากหลักฐานในพื้นที่เดียว
        </p>
        <div className="loginOrbit">
          <Mascot size={200} />
        </div>
      </section>
      <form onSubmit={login} className="loginForm">
        <span className="eyebrow">AUTHORIZED PERSONNEL ONLY</span>
        <h2>เข้าสู่ศูนย์ควบคุม</h2>
        <p>ใช้บัญชีแอดมินเดิมของ Sentinel</p>
        <label className="field">
          ชื่อผู้ใช้
          <input
            value={user}
            maxLength="100"
            autoComplete="username"
            required
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        <label className="field">
          รหัสผ่าน
          <input
            type="password"
            value={password}
            maxLength="1024"
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
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
        <small>การยืนยันตัวตนตรวจที่ Backend ไม่ได้บันทึกรหัสในหน้าเว็บ</small>
      </form>
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
  return s < 5 ? "เมื่อสักครู่" : s < 60 ? `${s} วินาทีที่แล้ว` : `${Math.round(s / 60)} นาทีที่แล้ว`;
}
function routeOf() {
  const [p = "overview", id] = location.hash.replace(/^#\/?/, "").split("/");
  return {
    page: titles[p] ? p : "overview",
    id: /^\d+$/.test(id || "") ? Number(id) : null,
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
    [q, setQ] = useState(""),
    [submittedSearch, setSubmittedSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    lock = useRef(false),
    toastTimer = useRef(null),
    routeTransition = useRef(null),
    routeRef = useRef(route);
  useEffect(() => {
    const change = () => {
      const nextRoute = routeOf();
      const go = () => {
        if (routeRef.current.page !== nextRoute.page) setToast(null);
        routeRef.current = nextRoute;
        setRoute(nextRoute);
      };
      if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        try {
          routeTransition.current?.skipTransition();
          routeTransition.current = document.startViewTransition(() => flushSync(go));
          routeTransition.current.finished.catch(() => {});
        } catch { go(); }
      } else go();
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
          message: path.endsWith("/approve") ? "บล็อก IP สำเร็จ" : "บันทึกการดำเนินการแล้ว",
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
  const ctx = { ...live, now, user, busy, act, searchQuery: submittedSearch },
    [title, subtitle] = titles[route.page],
    active = route.page === "incident" ? "incidents" : route.page;
  const navRail = useNavIndicator(active);
  const search = (e) => {
    e.preventDefault();
    setSubmittedSearch(q);
    location.hash = `/incidents`;
  };
  return (
    <div className="nShell">
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
      <header className="nHeader">
        <a className="brand" href="#/overview">
          <SentinelLogo />
        </a>
        <span className="headerLabel">SECURITY WORKSPACE</span>
        <form className="commandSearch" onSubmit={search}>
          <Icon name="search" size={15} />
          <input
            aria-label="ค้นหาเหตุการณ์ทั้งระบบ"
            placeholder="ค้นหา IP หรือเหตุการณ์…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <details className="connection">
          <summary data-connected={live.connected && !live.error || undefined}>
            <i
              className={`dot ${live.error ? "red" : live.connected ? "" : "amber"}`}
            />
            <span>
              {live.error
                ? "OFFLINE"
                : live.connected
                  ? "CONNECTED"
                  : "RECONNECTING"}
            </span>
          </summary>
          <div>
            <b>สถานะการเชื่อมต่อ</b>
            <span>
              {live.error
                ? "เซิร์ฟเวอร์ไม่พร้อม"
                : live.connected
                  ? "เชื่อมต่อระบบแล้ว"
                  : "กำลังเชื่อมต่อใหม่"}
            </span>
            <small>MODEL / {live.data.health?.model || "—"}</small>
            <small>
              {live.data.health?.model_ready
                ? "พร้อมวิเคราะห์"
                : "โมเดลยังไม่พร้อม อาจใช้ rule fallback"}
            </small>
            <small>LAST UPDATE / {time(live.updatedAt)}</small>
          </div>
        </details>
        <button
          className="themeButton"
          aria-label={
            theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"
          }
          onClick={toggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
        </button>
        <div className="operator">
          <span>{user.slice(0, 2).toUpperCase()}</span>
          <details>
            <summary>
              {user}
              <small>ผู้ดูแลระบบ</small>
            </summary>
            <button onClick={onLogout}>
              <Icon name="logout" size={15} />
              ออกจากระบบ
            </button>
          </details>
        </div>
      </header>
      <nav className="nRail" aria-label="เมนูหลัก" ref={navRail}>
        <span className="navIndicator" aria-hidden="true" />
        <span className="navSectionLabel">WORKSPACE</span>
        {nav.map(([key, label, icon], i) => (
          <a
            key={key}
            href={`#/${key}`}
            aria-current={active === key ? "page" : undefined}
            aria-label={label}
          >
            <small>0{i + 1}</small>
            <Icon name={icon} size={20} />
            <span>{label}</span>
            {key === "approvals" &&
              live.data.proposals.filter((p) => p.status === "pending").length >
                0 && (
                <b className="navCount" aria-hidden="true">
                  {
                    live.data.proposals.filter((p) => p.status === "pending")
                      .length
                  }
                </b>
              )}
          </a>
        ))}
        <span className="railFoot">
          <Icon name="shield" size={18} />
          <b>Human approved</b>
          <small>ผู้ดูแลยืนยันก่อนตอบสนอง</small>
        </span>
      </nav>
      <main id="workspace" tabIndex="-1">
        <div className="pageHeading">
          <div>
            <span className="eyebrow pageBreadcrumb">
              Workspace <span>/</span> {nav.find((n) => n[0] === active)?.[1]}
            </span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="pageActions">
            {live.updatedAt && (
              <span className="freshness" title={`อัปเดตล่าสุด ${time(live.updatedAt)}`}>
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
              <RefreshMotion busy={live.refreshing}><Icon name="refresh" size={14} /></RefreshMotion>
              {live.refreshing ? "กำลังโหลด" : "รีเฟรช"}
            </button>
          </div>
        </div>
        {(live.error || authError) && (
          <div role="alert" className={`notice bad ${live.error ? "connectionNotice" : ""}`}>
            {live.error && <Mascot pose="laptop" size={96} mood="offline" />}
            <span>{authError || "เชื่อมต่อ server ไม่ได้ กำลังลองใหม่"}</span>
            <button className="button" onClick={() => live.refresh(true)}>
              ลองใหม่
            </button>
          </div>
        )}
        <div key={route.page} className="pageContent">
          {live.loading ? (
            <ConnectionLoader />
          ) : !live.data.health ? (
            <div className="empty">
              ยังไม่มีข้อมูลที่แสดงได้ กรุณาตรวจการเชื่อมต่อ
            </div>
          ) : route.page === "overview" ? (
            <Overview ctx={ctx} />
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
          <span>SENTINEL / OBSERVATORY B</span>
          <span>
            {fixture
              ? "ข้อมูลสังเคราะห์ · ไม่เชื่อมระบบจริง"
              : "Human approved response · App-level protection"}
          </span>
        </footer>
      </main>
      {(busy || toast) && (
        <div className={`toast ${toast?.type || ""} ${!busy && toast?.approved ? "mascotToast" : ""}`} role="status">
          {!busy && toast?.approved ? <Mascot size={72} mood="happy" /> : <Icon
            name={busy ? "clock" : toast.type === "good" ? "check" : "incident"}
          />}
          <span>
            {busy ? "กำลังบันทึก…" : toast.message}
            {!busy && toast?.approved && <small>กฎระดับแอป · รอคำขอใหม่เพื่อยืนยันผล</small>}
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
