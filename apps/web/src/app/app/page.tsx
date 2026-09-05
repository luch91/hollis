import ReviewCasesPage from "./review-cases/page";

export default async function ApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{
    caseId?: string;
    risk?: string;
    status?: string;
    tab?: string;
    view?: string;
  }>;
}) {
  const query = await searchParams;
  return <ReviewCasesPage query={query} />;
}
