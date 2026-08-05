import { Activity, ShieldCheck } from "lucide-react";

export function PulseField({
  title = "Awaiting mandate",
  status = "UNBOUND",
  bond = "0.00",
}: {
  title?: string;
  status?: string;
  bond?: string;
}) {
  const healthy = ["ACTIVE", "OFFERED", "SETTLED", "EXPIRED"].includes(status);
  const alert = ["CHALLENGED", "REVIEW_READY", "RULING_READY"].includes(status);

  return (
    <div className="pulse-field" aria-label="Live mandate telemetry visualization">
      <div className="pulse-topline">
        <span><Activity size={15} /> Live mandate pulse</span>
        <strong className={alert ? "tone-alert" : healthy ? "tone-ok" : ""}>{status}</strong>
      </div>
      <div className="pulse-body">
        <span className="pulse-title">{title}</span>
        <span className="pulse-bond"><ShieldCheck size={14} /> {bond} GEN</span>
      </div>
    </div>
  );
}
