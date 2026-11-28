export type RankingCandidate = {
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  section: string;
  totalMarksObtained: number;
  totalMaximumMarks: number;
  percentage: number;
};

export function rankCandidates<T extends RankingCandidate>(candidates: T[]) {
  const sorted = [...candidates].sort((a, b) =>
    b.percentage - a.percentage ||
    b.totalMarksObtained - a.totalMarksObtained ||
    a.studentCode.localeCompare(b.studentCode) ||
    a.studentId.localeCompare(b.studentId)
  );
  let previousKey = "";
  let currentRank = 0;
  return sorted.map((candidate, index) => {
    const key = candidate.percentage + ":" + candidate.totalMarksObtained;
    if (key !== previousKey) currentRank = index + 1;
    previousKey = key;
    return { ...candidate, rank: currentRank };
  });
}
