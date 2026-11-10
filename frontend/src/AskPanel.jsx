import React, { useEffect, useRef, useState } from "react";
import { request } from "./api.js";
import { Icon } from "./ui.jsx";
import { duration, incidentId, isOpenIncident, kind } from "./lib.js";

// 'Ask me': explains the selected incident from the local knowledge base (backend/rag.py).
// Three fixed questions only; it reads and never proposes, approves or unblocks anything.
export const ASK_QUESTIONS = [
  ["what", "นี่คือการโจมตีอะไร"],
  ["risk", "อันตรายแค่ไหน"],
  ["response", "ควรรับมือยังไง"],
];

const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

// The incident the panel talks about: the one on screen, else the most severe open one, else the newest.
export function askContext(incidents = [], route = {}) {
  if (["incident", "trace"].includes(route.page) && route.id) {
    const shown = incidents.find((i) => String(i.id) === String(route.id));
    if (shown) return shown;
  }
  const open = incidents.filter(isOpenIncident);
  const pool = open.length ? open : incidents;
  return [...pool].sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || b.id - a.id)[0] || null;
}

// Evidence chips come from the database (response.evidence), never from model text.
export function evidenceChips(evidence = {}) {
  const chips = [];
  if (evidence.event_count) chips.push(`${evidence.event_count} เหตุการณ์ตามกฎ`);
  if (evidence.failed_logins) chips.push(`ล็อกอินผิด ${evidence.failed_logins}`);
  if (evidence.success_logins) chips.push(`ล็อกอินสำเร็จ ${evidence.success_logins}`);
  if (evidence.requests) chips.push(`${evidence.requests} คำขอ`);
  if (evidence.not_found) chips.push(`404 × ${evidence.not_found}`);
  if (evidence.ports?.length) chips.push(`${evidence.ports.length} พอร์ต`);
  if (evidence.block?.approved_by)
    chips.push(
      evidence.block.approved_by === "admin"
        ? `ผู้ดูแลบล็อก · ${duration(evidence.block.duration_seconds)}`
        : `ระบบบล็อกเอง · ${duration(evidence.block.duration_seconds)}`,
    );
  if (evidence.block?.status === "pending_admin") chips.push("รอผู้ดูแลอนุมัติ");
  return chips;
}

// KB notes are trusted project text; render paragraphs, "- " / "1. " lists and `code` as React nodes (no HTML).
export function NoteText({ text = "" }) {
  const inline = (line, key) =>
    line.split(/(`[^`]+`)/).map((part, i) =>
      part.startsWith("`") && part.endsWith("`") ? <code key={`${key}-${i}`}>{part.slice(1, -1)}</code> : part,
    );
  return text.split(/\n{2,}/).map((block, b) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^(- |\d+\. )/.test(l))) {
      const ordered = /^\d+\. /.test(lines[0]);
      const Tag = ordered ? "ol" : "ul";
      return <Tag key={b}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^(- |\d+\. )/, ""), `${b}-${i}`)}</li>)}</Tag>;
    }
    return <p key={b}>{lines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(l, `${b}-${i}`)}</React.Fragment>)}</p>;
  });
}

export default function AskPanel({ open, onClose, incidents, route, user, onThinking }) {
  const [selected, setSelected] = useState(null),
    [thread, setThread] = useState([]),
    [busy, setBusy] = useState(null),
    closeRef = useRef(null),
    bottom = useRef(null);
  const context = incidents.find((i) => i.id === selected) || askContext(incidents, route);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [thread.length, busy]);
  const ask = async (question, label) => {
    if (!context || busy) return;
    const entry = { id: `${context.id}-${question}-${Date.now()}`, incident: context, question: label };
    setBusy(entry.id);
    onThinking?.(true);
    try {
      const { data } = await request(`/api/incidents/${context.id}/ask`, { method: "POST", body: { question } });
      setThread((t) => [...t, { ...entry, answer: data }]);
    } catch (err) {
      setThread((t) => [...t, {
        ...entry,
        error: err.status === 409 ? "ระบบกำลังวิเคราะห์ incident อยู่ ลองถามอีกครั้งในอีกสักครู่" : "ตอบไม่ได้ในตอนนี้ ลองอีกครั้ง",
      }]);
    } finally {
      setBusy(null);
      onThinking?.(false);
    }
  };
  if (!open) return null;
  return (
    <aside className="askPanel" aria-label="Ask me · ถามเรื่อง incident" data-thinking={busy ? "true" : undefined}>
      <header className="askHead">
        <span className="askAvatar" aria-hidden="true"><Icon name="shield" size={30}/></span>
        <span className="askTitle">
          <b>Ask me</b>
          <small><i className="askDot" aria-hidden="true" />คลังความรู้ในเครื่อง · ไม่ส่งข้อมูลออกนอกระบบ</small>
        </span>
        <button ref={closeRef} type="button" className="askClose" onClick={onClose} aria-label="ปิด Ask me">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="askBody">
        {!thread.length && (
          <div className="askHello">
            <span className="askOrb" aria-hidden="true"><Icon name="shield" size={30}/></span>
            <h2>สวัสดี {user || "ผู้ดูแล"}</h2>
            <p>ถามเรื่อง incident ที่เลือกได้ คำตอบมาจากคลังความรู้ของ SENTINEL พร้อมแหล่งอ้างอิง Ask me ไม่สั่งบล็อกหรือปลดบล็อก</p>
          </div>
        )}
        {thread.map((t) => (
          <div className="askTurn" key={t.id}>
            <div className="askBubble askMine">
              {t.question}
              <small>{incidentId(t.incident.id)} · {kind(t.incident.kind)}</small>
            </div>
            <div className={`askBubble askReply${t.error ? " askError" : ""}`}>
              {t.error ? t.error : (
                <>
                  <span className="askLabel">{t.answer.generated ? `ข้อความสรุปจากโมเดล · ${t.answer.model}` : "ข้อความจากคลังความรู้ (KB)"}</span>
                  <NoteText text={t.answer.answer} />
                  {evidenceChips(t.answer.evidence).length > 0 && (
                    <div className="askEvidence" aria-label="หลักฐานจากระบบ">
                      {evidenceChips(t.answer.evidence).map((c) => <span key={c}>{c}</span>)}
                    </div>
                  )}
                  <details className="askSources" open>
                    <summary>แหล่งอ้างอิง {t.answer.sources.length}</summary>
                    <ul>
                      {t.answer.sources.map((s) => (
                        <li key={s.id}>
                          <b>{s.title}</b>
                          <span>{s.refs.map((r) => <i key={r}>{r}</i>)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="askBubble askReply askTyping" role="status" aria-label="กำลังหาคำตอบ">
            <i /><i /><i />
          </div>
        )}
        <span ref={bottom} />
      </div>
      <footer className="askFoot">
        {incidents.length > 0 ? (
          <label className="askContext">
            <span>incident</span>
            <select value={context?.id ?? ""} onChange={(e) => setSelected(Number(e.target.value))} aria-label="เลือก incident ที่จะถาม">
              {incidents.map((i) => (
                <option key={i.id} value={i.id}>{incidentId(i.id)} · {kind(i.kind)} · {i.source_ip}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="askNone">ยังไม่มี incident ให้ถาม</p>
        )}
        <div className="askChips">
          {ASK_QUESTIONS.map(([q, label]) => (
            <button key={q} type="button" disabled={!context || Boolean(busy)} onClick={() => ask(q, label)}>
              {label}
            </button>
          ))}
        </div>
        <small>เลือกคำถามด้านบน ไม่มีช่องพิมพ์อิสระ · ตัวเลขในแผงมาจากฐานข้อมูลของระบบ</small>
      </footer>
    </aside>
  );
}
