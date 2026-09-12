const reviewCaseCreators = new Set(["administrator", "contributor", "owner", "reviewer"]);
const humanReviewers = new Set(["administrator", "owner", "reviewer"]);

export function canCreateReviewCases(role: string): boolean {
  return reviewCaseCreators.has(role);
}

export function canPerformHumanReview(role: string): boolean {
  return humanReviewers.has(role);
}

export function canManageAttestations(role: string): boolean {
  return humanReviewers.has(role);
}
