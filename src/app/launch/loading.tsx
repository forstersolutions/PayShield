import { RouteLoadingShell } from "@/app/components/route-loading-shell";

export default function Loading() {
  return (
    <RouteLoadingShell
      kicker="Revenue and rails console"
      title="Loading the activation cockpit."
      steps={[
        "Verify revenue switch",
        "Check app access",
        "Check bank rails",
        "Check live gates",
      ]}
    />
  );
}
