import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(status, detail) {
    super(
      typeof detail === "string"
        ? detail
        : JSON.stringify(detail).slice(0, 200),
    );
    this.status = status;
  }
}

// Demo endpoints answer 401/403 with a JSON body the UI needs to show, so callers may opt in to receive them.
export async function request(
  path,
  { method = "GET", body, accept = [] } = {},
) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "เชื่อมต่อ server ไม่ได้");
  }
  if (response.status === 401 && !path.startsWith("/api/auth/"))
    window.dispatchEvent(new Event("sentinel-auth-expired"));
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok && !accept.includes(response.status))
    throw new ApiError(
      response.status,
      payload?.detail ?? `HTTP ${response.status}`,
    );
  return { status: response.status, data: payload };
}

export const getJson = async (path) => (await request(path)).data;
export const postJson = async (path, body = {}) =>
  (await request(path, { method: "POST", body })).data;

const EMPTY = {
  health: null,
  events: [],
  incidents: [],
  proposals: [],
  rules: [],
  traffic: [],
};

// REST is the source of truth; the WebSocket only says "something changed, refetch".
export function useLiveData() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const inflight = useRef(null);

  const refresh = useCallback(async (force = false) => {
    if (inflight.current) {
      if (force === true) {
        await inflight.current;
        return refresh(true);
      }
      return inflight.current;
    }
    const run = (async () => {
      setRefreshing(true);
      try {
        const [health, events, incidents, proposals, rules, traffic] =
          await Promise.all(
            [
              "/api/health",
              "/api/events?limit=500",
              "/api/incidents",
              "/api/proposals",
              "/api/rules",
              "/api/traffic",
            ].map(getJson),
          );
        setData({ health, events, incidents, proposals, rules, traffic });
        setError("");
        setVersion((v) => v + 1);
        setUpdatedAt(new Date().toISOString());
      } catch (err) {
        setError(err.message);
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let socket,
      retry,
      debounce,
      stopped = false;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      socket.onopen = () => {
        setConnected(true);
        refresh();
      };
      socket.onmessage = () => {
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 150);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 2500);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    // Rule expiry happens without a server event, so poll slowly as well.
    const poll = setInterval(refresh, 15000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(debounce);
      clearInterval(poll);
      socket?.close();
    };
  }, [refresh]);

  return {
    data,
    loading,
    error,
    connected,
    refresh,
    version,
    updatedAt,
    refreshing,
  };
}

// Incident detail + events + traffic in one call; refetched whenever live data changes.
export function useReport(id, version) {
  const [state, setState] = useState({
    id: null,
    report: null,
    error: "",
    loading: true,
  });
  useEffect(() => {
    if (!id) {
      setState({ id, report: null, error: "", loading: false });
      return;
    }
    let cancelled = false;
    getJson(`/api/reports/${id}`)
      .then((report) => {
        if (!cancelled) setState({ id, report, error: "", loading: false });
      })
      .catch((err) => {
        if (!cancelled)
          setState((s) => ({
            id,
            report: err.status === 404 || s.id !== id ? null : s.report,
            error: err.status === 404 ? `ไม่พบ incident #${id}` : err.message,
            loading: false,
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);
  return state.id === id ? state : { report: null, error: "", loading: !!id };
}
