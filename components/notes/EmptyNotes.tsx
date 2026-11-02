"use client";

import styles from "./notes.module.css";

export function EmptyNotes() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon} role="img" aria-label="Notepad">
        📝
      </span>
      <h3 className={styles.emptyTitle}>No notes on the board yet</h3>
      <p className={styles.emptyDesc}>
        Type or paste any text above and click <strong>Save Note</strong> to post the first card!
      </p>
    </div>
  );
}
