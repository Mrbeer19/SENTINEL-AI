import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { scenarios, setScenario } from "./fixtures.js";
import { Workspace, useTheme } from "../src/App.jsx";
import "../src/fonts.css";
import "../src/style.css";
import "../src/product-theme.css";
import "../src/mission-control.css";
import "../src/mascot.css";
import "../src/motion.css";
if (!import.meta.env.DEV) throw new Error("Local fixture only");
if (!location.hash) location.hash = "/overview";
const requestedScenario = new URLSearchParams(location.search).get("scenario");
const initialScenario = scenarios.includes(requestedScenario)
  ? requestedScenario
  : "pending";
setScenario(initialScenario);
function Preview() {
  const [theme, toggle] = useTheme(),
    [scenario, setChosen] = useState(initialScenario);
  useEffect(() => {
    const update = (e) => setChosen(e.detail);
    window.addEventListener("fixture-scenario", update);
    return () => window.removeEventListener("fixture-scenario", update);
  }, []);
  return (
    <>
      <div className="fixtureBar">
        <b>B / NEW BUILD</b>
        <span>ข้อมูลสังเคราะห์ · ไม่ส่งคำสั่งจริง</span>
        <select
          aria-label="สถานการณ์ทดสอบ"
          value={scenario}
          onChange={(e) => {
            setChosen(e.target.value);
            setScenario(e.target.value);
          }}
        >
          {scenarios.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={() =>
            document
              .querySelector(".labCanvas canvas")
              ?.dispatchEvent(
                new Event("webglcontextlost", { cancelable: true }),
              )
          }
        >
          ตรวจ WebGL
        </button>
        <span data-qa-requests="[]" />
      </div>
      <Workspace
        theme={theme}
        toggleTheme={toggle}
        user="QA admin"
        onLogout={() => {}}
        fixture
      />
    </>
  );
}
createRoot(document.getElementById("root")).render(<Preview />);
