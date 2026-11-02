"use client";

import styles from "./notes.module.css";

export function NoteSkeleton() {
  const skeletonCards = [1, 2, 3, 4, 5, 6];

  return (
    <div className={styles.masonryGrid} aria-label="Loading notes">
      {skeletonCards.map((n) => (
        <div
          key={n}
          className={styles.card}
          style={{ height: `${160 + (n % 3) * 60}px` }}
        >
          <div
            className="skeleton"
            style={{ width: "85%", height: "16px", marginBottom: "8px" }}
          />
          <div
            className="skeleton"
            style={{ width: "95%", height: "14px", marginBottom: "8px" }}
          />
          <div
            className="skeleton"
            style={{ width: "70%", height: "14px", marginBottom: "8px" }}
          />
          <div
            className="skeleton"
            style={{ width: "50%", height: "14px", marginBottom: "auto" }}
          />

          <div className={styles.cardFooter}>
            <div className="skeleton" style={{ width: "60px", height: "12px" }} />
            <div className="skeleton" style={{ width: "80px", height: "24px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
