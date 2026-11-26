import { BookOpenCheck } from "lucide-react";
import { FeaturePlaceholder } from "@/components/workspace/feature-placeholder";

export default function ResultsPage() {
  return <FeaturePlaceholder eyebrow="ASSESSMENT" title="Results" description="Review evaluated answer sheets, inspect marking decisions, and publish institution results." icon={BookOpenCheck} />;
}
