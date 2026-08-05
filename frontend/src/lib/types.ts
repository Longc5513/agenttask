export type TxResult = {
  success: boolean;
  hash?: string;
  status?: string;
  data?: unknown;
  error?: string;
};

export type MandateRecord = {
  mandate_id: string;
  principal: string;
  agent: string;
  title: string;
  brief_url: string;
  evidence_url: string;
  bond: string;
  partial_pct: string;
  status: string;
  decision: string;
  reason: string;
  deadline: string;
  delivery_note: string;
  delivery_url: string;
  counter_note: string;
  agent_paid: string;
  principal_refunded: string;
};

export type ContractStats = {
  mandate_count: string;
  total_bonded: string;
  active_bond: string;
  total_agent_paid: string;
  total_principal_refunded: string;
};
