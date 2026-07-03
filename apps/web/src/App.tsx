import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { SetupWizard } from "./capture/SetupWizard";
import "./App.css";

function App() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark",
  );

  const toggleTheme = () => {
    const next = !isDark;
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    setIsDark(next);
  };

  return (
    <main className="app-shell">
      <h1>Guitar tutor</h1>
      <button type="button" className="theme-toggle" onClick={toggleTheme}>
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </button>
      <SetupWizard />
    </main>
  );
}

export default App;
