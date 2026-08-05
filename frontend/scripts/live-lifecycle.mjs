import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const accountFrom = (name) => {
  const raw = required(name);
  return createAccount(raw.startsWith("0x") ? raw : `0x${raw}`);
};

const address = required("CONTRACT_ADDRESS");
const provider = accountFrom("PROVIDER_PRIVATE_KEY");
const customer = accountFrom("CUSTOMER_PRIVATE_KEY");
const providerSdk = createClient({ chain: studionet, account: provider });
const customerSdk = createClient({ chain: studionet, account: customer });
const artifactUrl = required("IMMUTABLE_INCIDENT_PACKET_URL");
const bond = BigInt(process.env.BOND_WEI || "1000");
const minor = BigInt(process.env.MINOR_WEI || "200");
const major = BigInt(process.env.MAJOR_WEI || "600");

const contentCommitment = (url) => {
  const normalized = url.trim().toLowerCase();
  const ipfs = "https://ipfs.io/ipfs/";
  const arweave = "https://arweave.net/";
  const id = normalized.startsWith(ipfs)
    ? normalized.slice(ipfs.length).split("/")[0]
    : normalized.startsWith(arweave)
      ? normalized.slice(arweave.length).split("/")[0]
      : "";
  if (id.length < 32) {
    throw new Error("IMMUTABLE_INCIDENT_PACKET_URL must be IPFS or Arweave content.");
  }
  return `content:${id}`;
};

const commitment = contentCommitment(artifactUrl);
const readJson = async (sdk, functionName, args = []) =>
  JSON.parse(await sdk.readContract({ address, functionName, args }));
const assert = (condition, message, details) => {
  if (!condition) throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
};
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const write = async (sdk, functionName, args = [], value = 0n) => {
  const hash = await sdk.writeContract({ address, functionName, args, value });
  const receipt = await sdk.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 2000,
    retries: 180,
    fullTransaction: false,
  });
  const transaction = await sdk.getTransaction({ hash });
  const status = transaction.statusName || receipt.statusName || "UNKNOWN";
  const consensus = transaction.result_name || transaction.resultName || "";
  const execution =
    transaction.txExecutionResultName
    || receipt.txExecutionResultName
    || "NOT_EXPOSED_BY_SDK";
  if (status !== "ACCEPTED") {
    throw new Error(
      `${functionName} stopped at ${status}`
      + `${consensus ? ` (${consensus})` : ""}: ${hash}`,
    );
  }
  if (["NO_MAJORITY", "MAJORITY_DISAGREE", "UNDETERMINED", "REJECTED"].includes(consensus)) {
    throw new Error(`${functionName} consensus returned ${consensus}: ${hash}`);
  }
  if (!["NOT_EXPOSED_BY_SDK", "SUCCESS", "SUCCEEDED", "ACCEPTED"].includes(execution)) {
    throw new Error(`${functionName} execution returned ${execution}: ${hash}`);
  }
  return { hash, status, execution };
};

const writeWithRetry = async (
  sdk,
  functionName,
  args = [],
  value = 0n,
  attempts = 3,
) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await write(sdk, functionName, args, value);
    } catch (error) {
      lastError = error;
      if (
        attempt === attempts
        || !(error instanceof Error)
        || !/CANCELED|NO_MAJORITY/.test(error.message)
      ) {
        throw error;
      }
      print({ step: functionName, retry: attempt, reason: error.message });
    }
  }
  throw lastError;
};

const initial = await readJson(providerSdk, "get_stats");
const slaId = BigInt(initial.sla_count);
const statusOrigin = process.env.STATUS_ORIGIN || "https://www.githubstatus.com/";
const monitorOrigin = process.env.MONITOR_ORIGIN || "https://statusgator.com/";

const openedTx = await write(
  providerSdk,
  "open_sla",
  [
    customer.address,
    "AgentTask live lifecycle API",
    artifactUrl,
    commitment,
    statusOrigin,
    monitorOrigin,
  ],
  bond,
);
let record = await readJson(providerSdk, "get_sla", [slaId]);
assert(record.status === "DRAFT", "Provider bond did not open", { openedTx, record });
assert(record.provider === provider.address.toLowerCase(), "Provider sender binding failed", record);
assert(record.customer === customer.address.toLowerCase(), "Customer assignment failed", record);
assert(record.bond === bond.toString(), "Bond custody mismatch", record);
print({ step: "open_sla", transaction: openedTx, record });

const bandsTx = await write(providerSdk, "lock_payout_bands", [slaId, minor, major]);
record = await readJson(providerSdk, "get_sla", [slaId]);
assert(record.status === "OFFERED", "Payout bands were not locked", { bandsTx, record });
print({ step: "lock_payout_bands", transaction: bandsTx, record });

const activatedTx = await write(customerSdk, "activate_sla", [slaId]);
record = await readJson(providerSdk, "get_sla", [slaId]);
assert(record.status === "ACTIVE", "Customer did not activate SLA", { activatedTx, record });
print({ step: "activate_sla", transaction: activatedTx, record });

const incidentTx = await write(customerSdk, "report_incident", [
  slaId,
  "Independent telemetry recorded a sustained production API outage inside the locked observation window, with failed requests and unavailable health checks affecting the named customer.",
  artifactUrl,
  commitment,
  artifactUrl,
  commitment,
]);
record = await readJson(providerSdk, "get_sla", [slaId]);
assert(record.status === "INCIDENT_REPORTED", "Incident evidence was not locked", {
  incidentTx,
  record,
});
print({ step: "report_incident", transaction: incidentTx, record });

const responseTx = await write(providerSdk, "respond_incident", [
  slaId,
  artifactUrl,
  commitment,
  "The provider binds this immutable incident report as its authenticated response to the customer's exact outage window and independent monitoring evidence.",
]);
record = await readJson(providerSdk, "get_sla", [slaId]);
assert(record.status === "REVIEW_READY", "Provider response did not open review", {
  responseTx,
  record,
});
print({ step: "respond_incident", transaction: responseTx, record });

let rulingTx;
try {
  rulingTx = await writeWithRetry(
    customerSdk,
    "adjudicate_incident",
    [slaId],
  );
} catch (error) {
  record = await readJson(providerSdk, "get_sla", [slaId]);
  if (
    record.status !== "REVIEW_READY"
    || !(error instanceof Error)
    || !/CANCELED|NO_MAJORITY/.test(error.message)
  ) {
    throw error;
  }
  rulingTx = { consensusUnavailable: true, message: error.message };
}
record = await readJson(providerSdk, "get_sla", [slaId]);
assert(
  ["RULING_READY", "EVIDENCE_UNAVAILABLE", "REVIEW_READY"].includes(record.status),
  "Jury did not preserve a valid settlement or recovery state",
  { rulingTx, record },
);
print({ step: "adjudicate_incident", transaction: rulingTx, record });

if (record.status === "RULING_READY") {
  const settleTx = await write(customerSdk, "settle_incident", [slaId]);
  record = await readJson(providerSdk, "get_sla", [slaId]);
  assert(record.status === "SETTLED", "Bond was not settled", { settleTx, record });
  assert(record.bond === "0", "Escrow remained after settlement", record);
  assert(
    BigInt(record.customer_paid) + BigInt(record.provider_refunded) === bond,
    "Payout conservation failed",
    record,
  );
  print({ step: "settle_incident", transaction: settleTx, record });
} else {
  const customerRecovery = await write(customerSdk, "approve_recovery", [slaId]);
  const providerRecovery = await write(providerSdk, "approve_recovery", [slaId]);
  record = await readJson(providerSdk, "get_sla", [slaId]);
  assert(record.status === "RECOVERED", "Mutual recovery did not close escrow", {
    customerRecovery,
    providerRecovery,
    record,
  });
  assert(record.bond === "0", "Escrow remained after recovery", record);
  print({ step: "mutual_recovery", transactions: [customerRecovery, providerRecovery], record });
}

print({
  lifecycleVerified: true,
  contract: address,
  provider: provider.address,
  customer: customer.address,
  slaId: slaId.toString(),
});
