import { ClipboardList } from "lucide-react";
import { FeaturePlaceholder } from "@/components/workspace/feature-placeholder";

export default function ExamsPage() {
  return <FeaturePlaceholder eyebrow="EXAM MANAGEMENT" title="Exams" description="Create exam sessions, configure subjects and question counts, and prepare answer keys." icon={ClipboardList} />;
}
