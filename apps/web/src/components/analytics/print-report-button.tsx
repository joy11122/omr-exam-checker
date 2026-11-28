"use client";
import { Printer } from "lucide-react";

export function PrintReportButton() {
  return <button className="button button-secondary" type="button" onClick={() => window.print()}>
    <Printer size={15}/> Print / Save PDF
  </button>;
}
