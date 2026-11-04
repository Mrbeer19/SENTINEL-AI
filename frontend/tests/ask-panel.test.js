import test, { after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const ask = await server.ssrLoadModule("/src/AskPanel.jsx");
const { default: AskPanel, askContext, evidenceChips, NoteText, ASK_QUESTIONS } = ask;

const incidents = [
  { id: 1, kind: "PORT_SCAN", severity: "MEDIUM", status: "verified", source_ip: "198.51.100.1" },
  { id: 2, kind: "HTTP_AUTH_BRUTE_FORCE", severity: "HIGH", status: "awaiting_approval", source_ip: "198.51.100.2" },
  { id: 3, kind: "WEB_SCAN", severity: "MEDIUM", status: "detected", source_ip: "198.51.100.3" },
];
const html = (props) => renderToStaticMarkup(React.createElement(AskPanel, { onClose() {}, incidents, route: {}, user: "admin", ...props }));

test("the panel talks about the incident on screen, else the most severe open one", () => {
  assert.equal(askContext(incidents, { page: "incident", id: "1" }).id, 1);
  assert.equal(askContext(incidents, { page: "trace", id: "3" }).id, 3);
  assert.equal(askContext(incidents, { page: "overview" }).id, 2);
  assert.equal(askContext([], {}), null);
});

test("three fixed questions, no free text box, labelled as local KB and read-only", () => {
  const out = html({ open: true });
  assert.deepEqual(ASK_QUESTIONS.map(([q]) => q), ["what", "risk", "response"]);
  for (const [, label] of ASK_QUESTIONS) assert.match(out, new RegExp(label));
  assert.doesNotMatch(out, /<input|<textarea/);
  assert.match(out, /ไม่สั่งบล็อกหรือปลดบล็อก/);
  assert.match(out, /ไม่มีช่องพิมพ์อิสระ/);
  assert.match(out, /aria-label="ปิด Ask me"/);
  assert.equal(html({ open: false }), "");
});

test("evidence chips are built from the database fields only", () => {
  assert.deepEqual(
    evidenceChips({ event_count: 6, failed_logins: 6, ports: [21, 22], block: { approved_by: "rule (automatic)", duration_seconds: 600 } }),
    ["6 เหตุการณ์ตามกฎ", "ล็อกอินผิด 6", "2 พอร์ต", "ระบบบล็อกเอง · 10 นาที"],
  );
  assert.deepEqual(evidenceChips({ block: { approved_by: "admin", duration_seconds: 0 } }), ["ผู้ดูแลบล็อก · จนกว่าจะปลดบล็อก"]);
  assert.deepEqual(evidenceChips({ block: { status: "pending_admin" } }), ["รอผู้ดูแลอนุมัติ"]);
});

test("KB notes render as text nodes: lists, code, and no raw HTML", () => {
  const out = renderToStaticMarkup(React.createElement(React.Fragment, null,
    NoteText({ text: "บรรทัด `/.env`\n\n1. หนึ่ง\n2. สอง\n\n<img src=x onerror=alert(1)>" })));
  assert.match(out, /<code>\/\.env<\/code>/);
  assert.match(out, /<ol><li>หนึ่ง<\/li><li>สอง<\/li><\/ol>/);
  assert.match(out, /&lt;img/);
  assert.doesNotMatch(out, /<img/);
});
