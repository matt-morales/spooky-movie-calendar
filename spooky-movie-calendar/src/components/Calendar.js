import { useEffect, useMemo, useState } from "react";
import "./Calendar.css";

export default function Calendar() {
  const daysInMonth = 31;
  const monthLabel = "October 2025";

  const initialFromHash = useMemo(() => {
    const m = window.location.hash.match(/#movie-(\d{1,2})/);
    const d = m ? parseInt(m[1], 10) : 1;
    return Number.isFinite(d) && d >= 1 && d <= daysInMonth ? d : 1;
  }, []);

  const [selectedDay, setSelectedDay] = useState(initialFromHash);
  const [collapsed, setCollapsed] = useState(false);

  // Keep a CSS var with the sticky calendar's height up to date.
  useEffect(() => {
    const root = document.documentElement;
    const cal = document.querySelector(".cal");
    if (!cal) return;

    const setHeightVar = () => {
      root.style.setProperty("--cal-height", `${cal.offsetHeight}px`);
    };

    setHeightVar();

    const ro = new ResizeObserver(setHeightVar);
    ro.observe(cal);

    // fonts can change height a bit on load
    if (document.fonts?.ready) {
      document.fonts.ready.then(setHeightVar);
    }

    window.addEventListener("orientationchange", setHeightVar);
    window.addEventListener("resize", setHeightVar);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", setHeightVar);
      window.removeEventListener("resize", setHeightVar);
    };
  }, []);

  const handleClick = (day) => {
    setSelectedDay(day);

    const el = document.getElementById(`movie-${day}`);
    if (el) {
      // Native scroll + scroll-margin-top does the perfect alignment,
      // even on mobile with a sticky element.
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#movie-${day}`);
    }
  };

  const toggleCollapsed = () => setCollapsed((c) => !c);

  return (
    <div className="cal">
      <header className="cal-header" onClick={toggleCollapsed}>
        <span>{monthLabel}</span>
        <span
          className={`cal-caret ${collapsed ? "down" : "up"}`}
          aria-hidden="true"
        />
      </header>
      <div className={`cal-grid ${collapsed ? "is-collapsed" : ""}`}>
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              className={`cal-day${isSelected ? " is-selected" : ""}`}
              aria-pressed={isSelected}
              onClick={() => handleClick(day)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
