import { FileSearch } from "lucide-react";
import { FeaturePlaceholder } from "@/components/workspace/feature-placeholder";

export default function ScansPage() {
  return <FeaturePlaceholder eyebrow="OMR PROCESSING" title="OMR scans" description="Upload answer sheets, monitor scan batches, and review uncertain bubble detections." icon={FileSearch} />;
}
