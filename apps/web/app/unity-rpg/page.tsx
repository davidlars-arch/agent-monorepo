import { UnityRpgShell } from "@/components/unity/unity-rpg-shell";

export default async function UnityRpgPage({
  searchParams
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const params = await searchParams;
  return <UnityRpgShell embedded={params.embed === "1"} />;
}
