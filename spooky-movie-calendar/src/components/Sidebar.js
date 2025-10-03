// components/Sidebar.js
import Title from "./Title";
import "./Sidebar.css";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <Title />
      <div className="sb-squiggle-wrap" aria-hidden="true">
        <svg
          className="sb-squiggle"
          viewBox="0 0 341 14"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          role="img"
        >
          <title>Decorative underline</title>
          <path
            d="M1.43945 8.29817C2.37402 8.29817 3.30859 8.29817 14.6988 8.18474C26.0891 8.0713 47.9066 7.84444 59.6547 7.39155C72.46 6.89791 81.6225 6.4075 98.4984 7.63578C116.218 8.92546 126.768 7.54074 129.115 6.59372C131.582 5.59823 149.826 4.16902 176.856 3.27795C191.423 2.79772 205.019 0.462566 231.295 1.40663C240.263 1.72884 246.371 0.693192 267.787 7.33472C289.201 13.9751 294.168 8.32887 301.384 8.24587C317.806 10.7053 322.242 11.7976 328.146 12.8075C330.665 12.99 334.558 13.077 339.536 12.5008"
            stroke="var(--sb-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        </svg>
      </div>

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
                src={process.env.PUBLIC_URL + "/icons/letterboxd.png"}
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
