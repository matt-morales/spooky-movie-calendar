// components/Sidebar.js
import Title from "./Title";
import "./Sidebar.css";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <Title />

      <div className="sb-intro">
        <h3 className="sb-kicker">
          One fright a day. Let’s watch, review, and scream together.
        </h3>

        <p className="sb-body">
          Scroll down for one great fright per day. Each date unlocks a horror
          movie you can watch, rate, and review — then join the community by
          adding your own comment.
        </p>

        <hr className="sb-rule" />

        <ul className="sb-links">
          <li>
            <a
              href="https://letterboxd.com/snowkempm/list/31-nights-of-halloween-whore-movies/"
              className="sb-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="/icons/letterboxd.png"
                alt=""
                className="sb-link-icon"
                aria-hidden="true"
              />
              <span className="sb-link-text">Letterboxd</span>
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
}
