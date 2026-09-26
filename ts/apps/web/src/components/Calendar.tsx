import { useEffect } from "react";
import { localIsoDate, monthLabel } from "../lib/format";
import { useAppState, useDispatch, useServices } from "../state/AppState";
import { calendarToggled, daySelected } from "../state/events";
import "./Calendar.css";

export default function Calendar() {
  const { calendar, movies, watched } = useAppState();
  const { selectedDay, collapsed } = calendar;
  const dispatch = useDispatch();
  const { analytics } = useServices();

  // Keep a CSS var with the sticky calendar's height up to date.
  useEffect(() => {
    const root = document.documentElement;
    const cal = document.querySelector<HTMLElement>(".cal");
    if (!cal) return;

    const setHeightVar = () => {
      root.style.setProperty("--calendar-height", `${cal.offsetHeight}px`);
    };

    setHeightVar();

    const ro = new ResizeObserver(setHeightVar);
    ro.observe(cal);

    // fonts can change height a bit on load
    document.fonts?.ready.then(setHeightVar);

    window.addEventListener("orientationchange", setHeightVar);
    window.addEventListener("resize", setHeightVar);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", setHeightVar);
      window.removeEventListener("resize", setHeightVar);
    };
  }, []);

  const handleClick = (day: number) => {
    dispatch(daySelected(day));
    analytics.track("day_selected", { day });

    const el = document.getElementById(`movie-${day}`);
    if (el) {
      // Native scroll + scroll-margin-top does the perfect alignment,
      // even on mobile with a sticky element.
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#movie-${day}`);
    }
  };

  const toggleCollapsed = () => {
    dispatch(calendarToggled());
    analytics.track("calendar_toggled", { collapsed: !collapsed });
  };

  const today = localIsoDate(new Date());

  return (
    <div className="cal">
      <div className="cal-bar">
        <button type="button" className="cal-header" aria-expanded={!collapsed} onClick={toggleCollapsed}>
          <span>{monthLabel(movies.items)}</span>
          <span className={`cal-caret ${collapsed ? "down" : "up"}`} aria-hidden="true" />
        </button>
        <ul className="cal-legend" aria-label="Key">
          <li className="is-today">Today</li>
          <li className="is-watched">Watched</li>
          <li className="is-upcoming">Upcoming</li>
        </ul>
      </div>
      <div className={`cal-grid ${collapsed ? "is-collapsed" : ""}`} role="group" aria-label="Choose a night">
        {movies.items.map(({ id, day, date }) => {
          const isSelected = day === selectedDay;
          const isToday = date === today;
          const isWatched = watched.includes(id);
          const classes = ["cal-day", isSelected && "is-selected", isToday && "is-today", isWatched && "is-watched"];
          return (
            <button
              key={day}
              type="button"
              className={classes.filter(Boolean).join(" ")}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={isWatched ? `${day}, watched` : undefined}
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
