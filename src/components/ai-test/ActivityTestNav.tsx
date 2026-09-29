import Link from "next/link";
import styles from "./activity-test-nav.module.css";

export function ActivityTestNav({ active }: { active: "DNA" | "ICAN_WECAN" | "ONE_TOPIC" | "CURRICULUM_CREATIVE" }) {
  return (
    <nav className={styles.nav} aria-label="AI 활동 테스트 선택">
      <Link className={active === "ONE_TOPIC" ? styles.active : ""} href="/ai-test/one-topic">1인 1주제 융합활동</Link>
      <Link className={active === "DNA" ? styles.active : ""} href="/ai-test">
        DNA
      </Link>
      <Link
        className={active === "ICAN_WECAN" ? styles.active : ""}
        href="/ai-test/ican-wecan"
      >
        I CAN WE CAN
      </Link>
      <Link className={active === "CURRICULUM_CREATIVE" ? styles.active : ""} href="/ai-test/curriculum-creative">교과창체</Link>
    </nav>
  );
}
