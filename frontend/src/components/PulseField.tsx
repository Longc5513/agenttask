import { Activity, ShieldCheck } from "lucide-react";

export function PulseField({
  service = "Awaiting live SLA",
  status = "UNBOUND",
  bond = "0.00",
}: {
  service?: string;
  status?: string;
  bond?: string;
}) {
  const healthy = ["ACTIVE", "OFFERED", "SETTLED", "EXPIRED"].includes(status);
  const alert = ["INCIDENT_REPORTED", "REVIEW_READY", "RULING_READY"].includes(status);

  return (
    <div className="pulse-field" aria-label="Live SLA telemetry visualization">
      <div className="pulse-topline">
        <span><Activity size={15} /> Live service pulse</span>
        <strong className={alert ? "tone-alert" : healthy ? "tone-ok" : ""}>{status}</strong>
      </div>

      <svg
        className="pulse-chart"
        viewBox="0 0 720 250"
        role="img"
        aria-label="Stylized service uptime waveform"
      >
        <g className="pulse-grid">
          <path d="M0 45H720M0 95H720M0 145H720M0 195H720" />
          <path d="M72 0V250M144 0V250M216 0V250M288 0V250M360 0V250M432 0V250M504 0V250M576 0V250M648 0V250" />
        </g>
        <path
          className="pulse-shadow"
          d="M0 130 L58 130 L78 130 L92 78 L108 182 L127 112 L146 130 L260 130 L280 130 L294 102 L310 152 L330 130 L430 130 L454 130 L470 42 L488 210 L507 116 L526 130 L720 130"
        />
        <path
          className="pulse-line"
          d="M0 130 L58 130 L78 130 L92 78 L108 182 L127 112 L146 130 L260 130 L280 130 L294 102 L310 152 L330 130 L430 130 L454 130 L470 42 L488 210 L507 116 L526 130 L720 130"
        />
        <circle className="pulse-beacon" cx="526" cy="130" r="6" />
      </svg>

      <div className="pulse-footer">
        <div>
          <span>Service</span>
          <strong>{service}</strong>
        </div>
        <div>
          <span>Bond custody</span>
          <strong>{bond} GEN</strong>
        </div>
        <div className="jury-chip">
          <ShieldCheck size={17} />
          <span>Semantic jury</span>
        </div>
      </div>
    </div>
  );
}
