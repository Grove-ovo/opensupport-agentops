const roiEls = {
  tickets: document.getElementById("tickets"),
  automation: document.getElementById("automation"),
  failureRate: document.getElementById("failure-rate"),
  failureCost: document.getElementById("failure-cost"),
  reduction: document.getElementById("reduction"),
  automationValue: document.getElementById("automation-value"),
  failureRateValue: document.getElementById("failure-rate-value"),
  reductionValue: document.getElementById("reduction-value"),
  aiTickets: document.getElementById("ai-tickets"),
  failures: document.getElementById("failures"),
  riskExposure: document.getElementById("risk-exposure"),
  savings: document.getElementById("savings"),
  payback: document.getElementById("payback"),
  breakEven: document.getElementById("break-even"),
  memo: document.getElementById("memo"),
};

const sprintFee = 18000;

function usd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function fmt(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  );
}

function percent(value) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

function readRoi() {
  return {
    tickets: Math.max(0, Number(roiEls.tickets.value)),
    automation: Math.max(0, Number(roiEls.automation.value)) / 100,
    failureRate: Math.max(0, Number(roiEls.failureRate.value)) / 100,
    failureCost: Math.max(0, Number(roiEls.failureCost.value)),
    reduction: Math.max(0, Number(roiEls.reduction.value)) / 100,
  };
}

function renderRoi() {
  const data = readRoi();
  const aiTickets = data.tickets * data.automation;
  const failures = aiTickets * data.failureRate;
  const riskExposure = failures * data.failureCost;
  const savings = riskExposure * data.reduction;
  const payback = savings > 0 ? sprintFee / savings : Infinity;
  const breakEven = riskExposure > 0 ? sprintFee / riskExposure : Infinity;

  roiEls.automationValue.textContent = percent(data.automation * 100);
  roiEls.failureRateValue.textContent = percent(data.failureRate * 100);
  roiEls.reductionValue.textContent = percent(data.reduction * 100);
  roiEls.aiTickets.textContent = fmt(aiTickets);
  roiEls.failures.textContent = fmt(failures);
  roiEls.riskExposure.textContent = usd(riskExposure);
  roiEls.savings.textContent = usd(savings);
  roiEls.payback.textContent = Number.isFinite(payback) ? `${payback.toFixed(1)} months` : "n/a";
  roiEls.breakEven.textContent = Number.isFinite(breakEven) ? percent(breakEven * 100) : "n/a";
  roiEls.memo.textContent = `AI support workflow risk estimate

Monthly support tickets: ${fmt(data.tickets)}
AI-handled share: ${percent(data.automation * 100)}
AI-handled tickets: ${fmt(aiTickets)}
Severe failure rate: ${percent(data.failureRate * 100)}
Severe failures per month: ${fmt(failures)}
Estimated risk exposure per month: ${usd(riskExposure)}
Target risk reduction: ${percent(data.reduction * 100)}
Expected monthly savings: ${usd(savings)}
Sprint fee: ${usd(sprintFee)}
Estimated payback: ${Number.isFinite(payback) ? `${payback.toFixed(1)} months` : "n/a"}
Break-even risk reduction: ${Number.isFinite(breakEven) ? percent(breakEven * 100) : "n/a"}`;
}

async function copyMemo() {
  try {
    await navigator.clipboard.writeText(roiEls.memo.textContent);
  } catch {
    // Browser clipboard permission may be unavailable on local files.
  }
}

[
  roiEls.tickets,
  roiEls.automation,
  roiEls.failureRate,
  roiEls.failureCost,
  roiEls.reduction,
].forEach((input) => input.addEventListener("input", renderRoi));

document.getElementById("copy-memo").addEventListener("click", copyMemo);

renderRoi();
