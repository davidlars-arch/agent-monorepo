import { EarthGlobe } from "@/components/earth-globe";

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const params = await searchParams;
  return <EarthGlobe initialOpenProjectId={params.open} />;
}
