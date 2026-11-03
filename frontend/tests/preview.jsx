import React from "react";
import { createRoot } from "react-dom/client";
import { scenarios, setScenario } from "./fixtures.js";
import { Workspace, useTheme } from "../src/App.jsx";
import "../src/fonts.css";
import "../src/style.css";
import "../src/product-theme.css";
import "../src/mission-control.css";
import "../src/mascot.css";
import "../src/motion.css";
import "../src/orbit-theme.css";
if (!import.meta.env.DEV) throw new Error("Local fixture only");
if (!location.hash) location.hash = "/overview";
const requestedScenario = new URLSearchParams(location.search).get("scenario");
const initialScenario = scenarios.includes(requestedScenario)
  ? requestedScenario
  : "pending";
setScenario(initialScenario);
// Pick a scenario with ?scenario=<name>; the QA toolbar was removed from the page.
function Preview() {
  const [theme, toggle] = useTheme();
  return (
    <>
      <span data-qa-requests="[]" hidden />
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
