// Calendar.js
import { useMemo, useState } from "react";
import "./Calendar.css";

export default function Calendar() {
  const daysInMonth = 31;
  const monthLabel = "October 2025";

  // Start from URL hash (e.g. #movie-7) but do NOT auto-scroll.
  const initialFromHash = useMemo(() => {
    const m = window.location.hash.match(/#movie-(\d{1,2})/);
    const d = m ? parseInt(m[1], 10) : 1;
    return Number.isFinite(d) && d >= 1 && d <= daysInMonth ? d : 1;
  }, []);

  const [selectedDay, setSelectedDay] = useState(initialFromHash);

  const handleClick = (day) => {
    setSelectedDay(day);

    const target = document.getElementById(`movie-${day}`);
    const cal = document.querySelector(".cal");
    if (!target || !cal) return;

    // Use a stable offset: the sticky calendar's height
    const calHeight = cal.offsetHeight;

    // Absolute position of the movie card's top
    const targetTop = target.getBoundingClientRect().top + window.scrollY;

    // Update the hash without triggering the browser's native jump
    window.history.replaceState(null, "", `#movie-${day}`);

    // Scroll so that the movie card's top sits immediately under the calendar
    window.scrollTo({
      top: targetTop - calHeight,
      behavior: "smooth",
    });
  };

  return (
    <div className="cal">
      <header className="cal-header">{monthLabel}</header>
      <div className="cal-grid">
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
