import { TraderDashboard } from "@/components/trader-dashboard";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function Page() {
  const data = await getDashboardData();
  return <TraderDashboard data={data} />;
}
