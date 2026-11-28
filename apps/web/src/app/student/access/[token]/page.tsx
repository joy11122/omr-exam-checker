import type { Metadata } from "next";
import { BookOpenCheck, LockKeyhole } from "lucide-react";
import { StudentAccessConfirmation } from "@/components/student-portal/student-access-confirmation";
import styles from "../../results/student-results.module.css";

export const metadata: Metadata = { title: "Secure Student Access | OMR Checker", referrer: "no-referrer", robots: { index: false, follow: false } };
type Props = { params: Promise<{ token: string }> };

export default async function StudentAccessPage({ params }: Props) {
  const { token } = await params;
  return <main className={styles.page}><section className={styles.card}>
    <span className={styles.brand}><BookOpenCheck size={20}/> OMR Checker · Student Portal</span>
    <span className={styles.lock}><LockKeyhole size={22}/></span>
    <h1>Open your secure results</h1>
    <p>This private link is valid for one use and expires after 30 minutes. Continue only if you requested access to your exam results.</p>
    <StudentAccessConfirmation token={token}/>
  </section></main>;
}
