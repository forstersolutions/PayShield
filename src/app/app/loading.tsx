import { RouteLoadingShell } from "@/app/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      kicker="Household command center"
      title="Loading the money-control cockpit."
      steps={[
        "Collect paid access",
        "Connect bank source",
        "Apply bucket rules",
        "Run protected decisions",
      ]}
    />
  );
}
