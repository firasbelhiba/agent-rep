import jsPDF from "jspdf";

export async function generateWhitepaperPDF() {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 25;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const colors = {
    purple: [130, 89, 239] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    gray: [155, 155, 157] as [number, number, number],
    dark: [20, 20, 30] as [number, number, number],
    black: [0, 0, 0] as [number, number, number],
    lightGray: [200, 200, 200] as [number, number, number],
  };

  // Load logo as base64
  let logoDataUrl: string | null = null;
  try {
    const response = await fetch("/logo-trimmed.png");
    const blob = await response.blob();
    logoDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Logo loading failed, continue without it
  }

  function whitePage() {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");
  }

  function checkPage(needed: number) {
    if (y + needed > 275) {
      doc.addPage();
      whitePage();
      y = 25;
    }
  }

  function sectionLabel(text: string) {
    checkPage(20);
    doc.setFontSize(9);
    doc.setTextColor(...colors.purple);
    doc.setFont("helvetica", "bold");
    doc.text(text.toUpperCase(), margin, y);
    y += 7;
  }

  function sectionTitle(text: string) {
    checkPage(15);
    doc.setFontSize(20);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += 10;
  }

  function paragraph(text: string) {
    checkPage(15);
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 3;
  }

  function bulletPoint(text: string) {
    checkPage(10);
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    doc.setFillColor(...colors.purple);
    doc.circle(margin + 1.5, y - 1.2, 0.8, "F");
    const lines = doc.splitTextToSize(text, contentWidth - 8);
    doc.text(lines, margin + 6, y);
    y += lines.length * 4.5 + 1.5;
  }

  function formulaBox(text: string) {
    checkPage(14);
    doc.setFillColor(245, 243, 255);
    doc.roundedRect(margin, y - 4, contentWidth, 10, 2, 2, "F");
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.purple);
    doc.setFont("courier", "bold");
    doc.text(text, margin + 4, y + 2);
    y += 12;
  }

  function impactBox(text: string) {
    checkPage(18);
    doc.setFillColor(248, 245, 255);
    doc.setDrawColor(...colors.purple);
    doc.roundedRect(margin, y - 4, contentWidth, 14, 2, 2, "FD");
    doc.setFontSize(9);
    doc.setTextColor(...colors.purple);
    doc.setFont("helvetica", "bold");
    doc.text("Impact: ", margin + 4, y + 1);
    doc.setFont("helvetica", "normal");
    const impactLines = doc.splitTextToSize(text, contentWidth - 22);
    doc.text(impactLines, margin + 18, y + 1);
    y += 16;
  }

  // ========== COVER PAGE ==========
  doc.setFillColor(10, 10, 20);
  doc.rect(0, 0, 210, 297, "F");

  // Purple accent bar
  doc.setFillColor(...colors.purple);
  doc.rect(0, 0, 210, 4, "F");

  // Logo
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", margin, 55, 80, 20);
  }

  // Title
  doc.setFontSize(36);
  doc.setTextColor(...colors.white);
  doc.setFont("helvetica", "bold");
  doc.text("AgentRep", margin, 100);

  doc.setFontSize(16);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "normal");
  doc.text("Decentralized Reputation for AI Agents", margin, 112);

  // Subtitle
  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.setFont("helvetica", "normal");
  const subtitle = doc.splitTextToSize(
    "A trustless, on-chain reputation protocol built on Hedera using ERC-8004, HCS-10, and stake-based accountability.",
    contentWidth
  );
  doc.text(subtitle, margin, 128);

  // Bottom info
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("Technical Whitepaper", margin, 250);
  doc.text("Version 1.0  - March 2026", margin, 256);
  doc.text("Built on Hedera Hashgraph", margin, 262);

  // ========== PAGE 2: ABSTRACT + PROBLEM ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 1");
  sectionTitle("Abstract");
  paragraph(
    "As AI agents become autonomous participants in digital economies, the need for a decentralized, tamper-proof reputation system becomes critical. Without verifiable trust, agents cannot reliably collaborate, delegate tasks, or transact with each other."
  );
  paragraph(
    "AgentRep solves this by creating an on-chain reputation protocol built on Hedera. Every feedback submission, validation, dispute, and stake event is logged immutably to the Hedera Consensus Service (HCS), creating an auditable trail that no single entity can manipulate."
  );
  paragraph(
    "The system implements the ERC-8004 standard for Agent Identity, Reputation Registry, and Validation Registry, extended with Hedera-native features: HCS-10 agent connections, HCS-11 agent profiles, HBAR staking, and NFT-based reputation badges."
  );

  y += 8;
  sectionLabel("Section 2");
  sectionTitle("The Problem");
  paragraph("Today's AI agent ecosystems face a fundamental trust deficit:");
  y += 3;

  const problems = [
    ["No Verifiable History", "When Agent A asks Agent B to perform a task, there's no way to verify B's track record. Self-reported metrics are untrustworthy."],
    ["Sybil Attacks", "A malicious actor can create hundreds of agents to inflate their own reputation through fake feedback loops."],
    ["No Accountability", "Agents can give dishonest feedback with zero consequences. A competitor can tank an agent's reputation anonymously."],
    ["Centralized Trust Bottlenecks", "Existing reputation systems rely on centralized databases that can be tampered with, censored, or taken offline."],
  ];

  for (const [title, desc] of problems) {
    checkPage(18);
    doc.setFontSize(10);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(`- ${title}`, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(desc, contentWidth - 6);
    doc.text(lines, margin + 4, y);
    y += lines.length * 5 + 4;
  }

  // ========== SECTION 3: THE PROTOCOL ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 3");
  sectionTitle("The AgentRep Protocol");
  paragraph("AgentRep addresses these problems through four interconnected mechanisms, each providing a distinct layer of trust:");
  y += 5;

  // Mechanism 1
  doc.setFontSize(13);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("01  Reputation-Weighted Feedback", margin, y);
  y += 8;
  paragraph("Not all feedback is equal. When Agent A gives feedback on Agent B, the weight of that feedback is proportional to Agent A's own reputation score.");
  formulaBox("weight = 0.2 + 0.8 x (giverScore / 1000)");
  bulletPoint("New agent (score 0) -> feedback counts at 0.2x weight");
  bulletPoint("Established agent (score 500) -> feedback counts at 0.6x weight");
  bulletPoint("Elite agent (score 1000) -> feedback counts at full 1.0x weight");
  bulletPoint("Community (human) feedback -> fixed 0.5x weight");
  impactBox("A brand-new agent cannot single-handedly tank an established agent's reputation. Trust must be earned before influence is granted.");
  y += 5;

  // Mechanism 2
  checkPage(60);
  doc.setFontSize(13);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("02  Stake-Based Accountability", margin, y);
  y += 8;
  paragraph("Agents must stake HBAR before they can submit feedback. If their feedback is disputed and found dishonest, their stake is slashed.");
  formulaBox("Minimum stake: 5 HBAR | Slash: 10% per upheld dispute");
  bulletPoint("Registration requires 5 HBAR stake via AgentRepStaking smart contract");
  bulletPoint("POST /api/staking/dispute  - Target agent challenges dishonest feedback");
  bulletPoint("POST /api/staking/dispute/:id/resolve  - Third-party arbiter rules on dispute");
  bulletPoint("If upheld: 10% of stake slashed on-chain (e.g., 5 HBAR -> 4.5 HBAR)");
  impactBox("Economic skin-in-the-game prevents spam and dishonest feedback. Staking is enforced on-chain via Solidity smart contract.");
  y += 5;

  // Mechanism 3
  checkPage(60);
  doc.setFontSize(13);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("03  Cross-Validation & Outlier Detection", margin, y);
  y += 8;
  paragraph("The system automatically detects and discounts feedback that deviates significantly from the consensus using z-score statistical analysis.");
  formulaBox("outlierDiscount = max(0.1, 1.0 - (zScore - 1.5) / 3.0)");
  bulletPoint("Requires 3+ feedback entries to activate outlier detection");
  bulletPoint("Feedback >1.5 standard deviations from mean is flagged as outlier");
  bulletPoint("Outlier feedback is automatically discounted (down to 0.1x weight)");
  bulletPoint("Flagged outliers are returned in the API response for transparency");
  impactBox("If 10 agents rate Agent B at +90 and one rates it at -100, the outlier is automatically discounted.");
  y += 5;

  // Mechanism 4
  checkPage(60);
  doc.setFontSize(13);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("04  Validation of Validators", margin, y);
  y += 8;
  paragraph("When an agent validates another agent's capabilities, the weight of that validation depends on the validator's own reputation  - creating a recursive web of trust.");
  formulaBox("validationWeight = 0.3 + 0.7 x (validatorScore / 1000)");
  bulletPoint("Validator with score 0 -> validation counts at 0.3x weight");
  bulletPoint("Validator with score 500 -> validation counts at 0.65x weight");
  bulletPoint("Validator with score 1000 -> validation counts at full 1.0x weight");
  bulletPoint("Validator scores are cached per computation to prevent infinite recursion");
  impactBox("A low-reputation agent cannot inflate another agent's reliability score. Only established, trusted validators carry meaningful weight.");

  // ========== INTERACTION FLOW DIAGRAM ==========
  doc.addPage();
  whitePage();
  y = 25;

  sectionTitle("Interaction Flow");
  y += 5;

  // --- Sequence Diagram ---
  const colAgent = 45;      // x center for "Agent A (Service)"
  const colProtocol = 105;  // x center for "AgentRep Protocol"
  const colClient = 165;    // x center for "Agent B (Client)"
  const boxW = 44;
  const boxH = 28;
  const headerY = y;

  // Draw actor boxes (top)
  function actorBox(cx: number, title: string, subtitle: string, atY: number) {
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(200, 195, 220);
    doc.setLineWidth(0.4);
    doc.roundedRect(cx - boxW / 2, atY, boxW, boxH, 2, 2, "FD");
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(title, cx, atY + 10, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(...colors.purple);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, cx, atY + 17, { align: "center" });
  }

  actorBox(colAgent, "Agent A", "Service Provider", headerY);
  actorBox(colProtocol, "AgentRep", "Protocol + HCS", headerY);
  actorBox(colClient, "Agent B", "Client", headerY);

  // Lifelines
  const lifeStart = headerY + boxH + 2;
  const lifeEnd = headerY + boxH + 148;
  doc.setDrawColor(200, 200, 210);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(colAgent, lifeStart, colAgent, lifeEnd);
  doc.line(colProtocol, lifeStart, colProtocol, lifeEnd);
  doc.line(colClient, lifeStart, colClient, lifeEnd);
  doc.setLineDashPattern([], 0); // reset

  // Arrow drawing helper
  let msgY = lifeStart + 8;
  const msgGap = 20;

  function drawArrow(fromX: number, toX: number, atY: number, label: string, sublabel?: string) {
    // Line
    doc.setDrawColor(60, 60, 70);
    doc.setLineWidth(0.5);
    doc.line(fromX, atY, toX, atY);

    // Arrowhead
    const dir = toX > fromX ? -1 : 1;
    doc.setFillColor(60, 60, 70);
    doc.triangle(
      toX, atY,
      toX + dir * 3, atY - 1.5,
      toX + dir * 3, atY + 1.5,
      "F"
    );

    // Label above arrow
    const midX = (fromX + toX) / 2;
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(label, midX, atY - 4, { align: "center" });

    if (sublabel) {
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 130);
      doc.setFont("helvetica", "normal");
      doc.text(sublabel, midX, atY + 5, { align: "center" });
    }
  }

  // Step 1: Register + Stake
  drawArrow(colAgent, colProtocol, msgY, "1. Register + Stake 5 HBAR", "Identity Registry + Smart Contract");
  msgY += msgGap;

  // Step 2: Discover agents
  drawArrow(colClient, colProtocol, msgY, "2. Discover agents", "Query reputation scores");
  msgY += msgGap;

  // Step 3: HCS-10 connection
  drawArrow(colClient, colAgent, msgY, "3. HCS-10 Connection", "P2P topic created on Hedera");
  msgY += msgGap;

  // Step 4: Service request
  drawArrow(colClient, colAgent, msgY, "4. Service request", "Task delegation via connection topic");
  msgY += msgGap;

  // Step 5: Service response
  drawArrow(colAgent, colClient, msgY, "5. Service response", "Result delivered");
  msgY += msgGap;

  // Step 6: Submit feedback
  drawArrow(colClient, colProtocol, msgY, "6. Submit weighted feedback", "Logged to HCS + reputation updated");
  msgY += msgGap;

  // Step 7: Reputation update
  drawArrow(colProtocol, colAgent, msgY, "7. Reputation updated", "Score recalculated (0-1000)");
  msgY += 12;

  // Draw actor boxes (bottom)
  actorBox(colAgent, "Agent A", "Service Provider", msgY);
  actorBox(colProtocol, "AgentRep", "Protocol + HCS", msgY);
  actorBox(colClient, "Agent B", "Client", msgY);

  // Caption
  y = msgY + boxH + 8;
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 150);
  doc.setFont("helvetica", "italic");
  doc.text("Figure 1: End-to-end interaction flow between two agents using the AgentRep protocol.", pageWidth / 2, y, { align: "center" });

  // ========== SECTION 4: SCORING ALGORITHM ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 4");
  sectionTitle("Reputation Score Algorithm");
  paragraph("Each agent's reputation is computed as a composite score (0-1000) from four weighted components:");
  y += 5;

  // Table header
  const tableX = margin;
  const colWidths = [35, 15, 18, 92];

  doc.setFillColor(245, 243, 255);
  doc.rect(tableX, y - 4, contentWidth, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("COMPONENT", tableX + 2, y);
  doc.text("WEIGHT", tableX + colWidths[0] + 2, y);
  doc.text("MAX", tableX + colWidths[0] + colWidths[1] + 2, y);
  doc.text("SOURCE", tableX + colWidths[0] + colWidths[1] + colWidths[2] + 2, y);
  y += 8;

  const rows = [
    ["Quality", "30%", "300 pts", "Reputation-weighted + outlier-discounted feedback average"],
    ["Reliability", "30%", "300 pts", "Validator-weighted validation score average"],
    ["Activity", "20%", "200 pts", "Logarithmic scale of total interactions"],
    ["Consistency", "20%", "200 pts", "Low standard deviation in feedback = higher score"],
  ];

  for (const row of rows) {
    doc.setFontSize(9);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(row[0], tableX + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.purple);
    doc.text(row[1], tableX + colWidths[0] + 2, y);
    doc.setTextColor(100, 100, 100);
    doc.text(row[2], tableX + colWidths[0] + colWidths[1] + 2, y);
    doc.setTextColor(80, 80, 80);
    doc.text(row[3], tableX + colWidths[0] + colWidths[1] + colWidths[2] + 2, y);
    y += 7;
  }

  y += 5;
  doc.setFillColor(245, 243, 255);
  doc.roundedRect(margin, y - 4, contentWidth, 12, 2, 2, "F");
  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("courier", "bold");
  doc.text("total = quality + reliability + activity + consistency", margin + 10, y + 3);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");
  doc.text("Range: 0  - 1000 | Clamped to [0, 1000]", margin + 10, y + 8);
  y += 20;

  // Trust Tiers
  y += 5;
  doc.setFontSize(13);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("Trust Tier Classification", margin, y);
  y += 8;

  const tiers = [
    ["UNVERIFIED", "< 200", "< 3 activity", "New agents with minimal track record"],
    ["VERIFIED", ">= 200", ">= 3 activity", "Consistent positive feedback and validation history"],
    ["TRUSTED", ">= 500", ">= 10 activity", "High-performing with strong validation scores"],
    ["ELITE", ">= 800", ">= 20 activity", "Top-tier with exceptional track records"],
  ];

  for (const [tier, score, activity, desc] of tiers) {
    checkPage(12);
    doc.setFontSize(10);
    doc.setTextColor(...colors.purple);
    doc.setFont("helvetica", "bold");
    doc.text(tier, margin, y);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Score ${score}  |  ${activity}`, margin + 30, y);
    doc.setTextColor(80, 80, 80);
    doc.text(`  - ${desc}`, margin + 75, y);
    y += 7;
  }

  // ========== SECTION 5: ON-CHAIN ARCHITECTURE ==========
  y += 10;
  sectionLabel("Section 5");
  sectionTitle("On-Chain Architecture");
  paragraph("Every critical action in AgentRep is logged immutably to Hedera Consensus Service (HCS) topics, creating a tamper-proof audit trail verifiable by anyone on HashScan.");
  y += 3;

  const topics = [
    ["Identity Topic", "AGENT_REGISTERED, URI_UPDATED, METADATA_SET, WALLET_SET", "Tracks agent registration, URI changes, metadata updates, and wallet associations per ERC-8004 Identity Registry."],
    ["Feedback Topic", "FEEDBACK_SUBMITTED, FEEDBACK_REVOKED, FEEDBACK_RESPONSE, STAKE_DEPOSITED, STAKE_SLASHED", "Logs all feedback events, responses, stake deposits, and slash events."],
    ["Validation Topic", "VALIDATION_REQUESTED, VALIDATION_RESPONDED", "Records validation requests and responses per ERC-8004 Validation Registry."],
    ["Smart Contract", "stake, slash, unstake, getStake", "AgentRepStaking.sol deployed on Hedera (0.0.8264743). Manages HBAR staking, slashing, and unstaking."],
  ];

  for (const [name, events, desc] of topics) {
    checkPage(22);
    doc.setFontSize(10);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(name, margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(...colors.purple);
    doc.setFont("courier", "normal");
    const eventLines = doc.splitTextToSize(events, contentWidth - 4);
    doc.text(eventLines, margin + 2, y);
    y += eventLines.length * 3.5 + 2;
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(desc, contentWidth - 4);
    doc.text(descLines, margin + 2, y);
    y += descLines.length * 4.5 + 6;
  }

  // HCS Message Format example
  y += 3;
  checkPage(50);
  doc.setFontSize(10);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("HCS Message Format", margin, y);
  y += 6;

  const hcsJson = [
    '{',
    '  "type": "FEEDBACK_SUBMITTED",',
    '  "timestamp": 1773690206081,',
    '  "data": {',
    '    "agentId": "agent-xxx",',
    '    "clientAddress": "agent-yyy",',
    '    "feedbackIndex": 11,',
    '    "value": 95,',
    '    "valueDecimals": 0,',
    '    "tag1": "security-audit",',
    '    "tag2": "smart-contracts"',
    '  }',
    '}',
  ];

  const hcsBlockHeight = hcsJson.length * 4 + 6;
  doc.setFillColor(248, 246, 255);
  doc.setDrawColor(220, 210, 245);
  doc.roundedRect(margin, y - 3, contentWidth, hcsBlockHeight, 2, 2, "FD");
  doc.setFontSize(7.5);
  doc.setFont("courier", "normal");
  doc.setTextColor(90, 60, 150);
  for (const line of hcsJson) {
    doc.text(line, margin + 4, y + 1);
    y += 4;
  }
  y += 8;

  // ========== SECTION 6: THE ERC-8004 STANDARD ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 6");
  sectionTitle("The ERC-8004 Standard");
  paragraph("ERC-8004 is an Ethereum standard proposal that defines a decentralized reputation system for autonomous AI agents. AgentRep is the first implementation of ERC-8004 on Hedera, adapted to leverage HCS for lower-cost, higher-throughput immutable logging.");
  y += 3;

  // The Problem
  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("The Problem ERC-8004 Solves", margin, y);
  y += 6;
  paragraph("As AI agents become autonomous economic actors  - making decisions, executing transactions, and interacting with other agents  - there is no standardized way to assess their trustworthiness. Without reputation, users cannot distinguish reliable agents from unreliable or malicious ones.");

  // The Solution
  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("AgentRep: ERC-8004 on Hedera", margin, y);
  y += 6;
  paragraph("AgentRep implements the full ERC-8004 specification on Hedera, using HCS for immutable logging and HTS for reputation tokens. Feedback is multi-dimensional, verifiable, and weighted by the giver's own reputation  - creating a transparent trust layer that agents, developers, and users can rely on.");
  y += 3;

  // Key Components
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("ERC-8004 Core Components Implemented", margin, y);
  y += 7;
  bulletPoint("Agent Registry: On-chain registration with unique identity, metadata, and wallet association");
  bulletPoint("Feedback System: Scored (-100 to +100), tagged, and timestamped feedback from real interactions");
  bulletPoint("Validation Layer: Independent third-party verification of agent capabilities (0-100)");
  bulletPoint("Reputation Score: Composite 0-1000 metric from Quality, Reliability, Activity, and Consistency");
  bulletPoint("Trust Tiers: Progressive trust levels (Unverified -> Verified -> Trusted -> Elite)");
  bulletPoint("Sybil Resistance: Stake-based accountability + rate limiting + wallet verification");
  y += 3;

  // Why Hedera
  checkPage(30);
  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("Why Hedera over Ethereum for ERC-8004", margin, y);
  y += 6;
  paragraph("Hedera's Consensus Service provides unique advantages over Ethereum smart contracts for reputation systems: sub-second finality, predictably low fees ($0.0001 per message), high throughput (10,000+ TPS), and native ordering guarantees  - making it ideal for high-frequency feedback logging.");
  y += 3;

  // Comparison table
  checkPage(70);
  doc.setFontSize(10);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("ERC-8004 (Ethereum) vs AgentRep (Hedera)", margin, y);
  y += 7;

  const compColWidths = [35, 55, 55];
  // Table header
  doc.setFillColor(245, 243, 255);
  doc.rect(margin, y - 4, contentWidth, 8, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("FEATURE", margin + 2, y);
  doc.text("ERC-8004 (ETHEREUM)", margin + compColWidths[0] + 2, y);
  doc.text("AGENTREP (HEDERA)", margin + compColWidths[0] + compColWidths[1] + 2, y);
  y += 7;

  const compRows = [
    ["Storage", "Smart contract state", "HCS consensus messages"],
    ["Cost per event", "Variable gas (~$0.50+)", "Fixed ~$0.0001 per message"],
    ["Finality", "~12 seconds", "~3-5 seconds"],
    ["Throughput", "~15 TPS (L1)", "10,000+ TPS"],
    ["Agent Identity", "Contract-based registry", "HCS-10 + HCS-11 standards"],
    ["Communication", "Events / off-chain", "Native HCS P2P topics"],
    ["Immutability", "Contract state", "Append-only HCS log"],
    ["Verification", "On-chain queries", "Mirror Node + HashScan"],
  ];

  for (const [feature, erc, hedera] of compRows) {
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(feature, margin + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(erc, margin + compColWidths[0] + 2, y);
    doc.setTextColor(...colors.purple);
    doc.text(hedera, margin + compColWidths[0] + compColWidths[1] + 2, y);
    y += 6;
  }
  y += 5;

  // ========== SECTION 6b: HCS-10 & HCS-11 PROTOCOLS ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 6 (continued)");
  sectionTitle("Hedera Open Standards");
  paragraph("AgentRep is built on two Hedera open standards for agent communication and identity, extending them with reputation and accountability layers.");
  y += 5;

  // HCS-10
  doc.setFontSize(13);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("HCS-10: Agent Communication Protocol", margin, y);
  y += 8;
  paragraph("HCS-10 defines a standard for AI agent-to-agent communication on Hedera. Each agent has inbound and outbound HCS topics, enabling peer-to-peer messaging with consensus ordering and immutable audit trails.");
  y += 2;

  const hcs10Components = [
    ["Inbound Topic", "Receives connection requests and incoming messages from other agents"],
    ["Outbound Topic", "Broadcasts responses, status updates, and connection acceptances"],
    ["Connection Topics", "Shared HCS topics created for direct bidirectional P2P messaging"],
    ["Connection Lifecycle", "request -> accept -> active -> messaging (all on-chain)"],
    ["Sybil Gate", "Active HCS-10 connection required before feedback submission"],
    ["Capabilities", "19 standardized AI agent capabilities (text gen, code gen, security audit, etc.)"],
  ];

  for (const [name, desc] of hcs10Components) {
    checkPage(10);
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(...colors.purple);
    doc.circle(margin + 1.5, y - 1.2, 0.8, "F");
    doc.text(name + ": ", margin + 6, y);
    const nameWidth = doc.getTextWidth(name + ": ");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const remaining = contentWidth - 8 - nameWidth;
    if (remaining > 20) {
      const lines = doc.splitTextToSize(desc, contentWidth - 8);
      doc.text(lines, margin + 6 + nameWidth, y);
      y += lines.length * 4.5 + 1.5;
    } else {
      y += 4.5;
      const lines = doc.splitTextToSize(desc, contentWidth - 10);
      doc.text(lines, margin + 8, y);
      y += lines.length * 4.5 + 1.5;
    }
  }
  y += 5;

  // HCS-11
  checkPage(50);
  doc.setFontSize(13);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("HCS-11: Agent Identity Profiles", margin, y);
  y += 8;
  paragraph("HCS-11 provides a standard for verifiable agent identity on Hedera. Agent profiles include capabilities, skills, metadata, and are stored as HCS topic messages  - providing tamper-proof identity that can be independently verified.");
  y += 2;

  const hcs11Components = [
    ["Profile Topic", "Stores agent identity, bio, capabilities, and metadata on-chain"],
    ["Capabilities Registry", "Standardized list of agent abilities (0-18) for discovery and matching"],
    ["HOL Registry", "Hedera Open Ledger entry makes the agent publicly discoverable"],
    ["Verification", "Profiles are independently verifiable via Hedera Mirror Node and HashScan"],
  ];

  for (const [name, desc] of hcs11Components) {
    checkPage(10);
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(...colors.purple);
    doc.circle(margin + 1.5, y - 1.2, 0.8, "F");
    doc.text(name + ": ", margin + 6, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(desc, contentWidth - 8);
    doc.text(lines, margin + 6, y + 4.5);
    y += lines.length * 4.5 + 5;
  }
  y += 5;

  // ERC-8004 Interface Summary
  checkPage(40);
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("ERC-8004 Interface Summary", margin, y);
  y += 7;

  const erc8004Interfaces = [
    {
      name: "Identity Registry",
      items: ["register", "setAgentURI", "setMetadata", "setAgentWallet"],
    },
    {
      name: "Reputation Registry",
      items: ["giveFeedback", "revokeFeedback", "appendResponse", "getSummary", "readFeedback"],
    },
    {
      name: "Validation Registry",
      items: ["requestValidation", "submitValidation", "getValidationStatus"],
    },
  ];

  for (const iface of erc8004Interfaces) {
    checkPage(12);
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(iface.name + ":", margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(...colors.purple);
    doc.setFont("courier", "normal");
    doc.text(iface.items.join("  |  "), margin + 4, y);
    y += 6;
  }

  // ========== SECTION 7: STAKING & SMART CONTRACT ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 7");
  sectionTitle("Staking & Smart Contract");
  paragraph("AgentRep enforces economic accountability through on-chain HBAR staking via the AgentRepStaking Solidity smart contract deployed on Hedera. Staking creates real financial consequences for dishonest behavior, making the reputation system tamper-resistant.");
  y += 3;

  // Contract Details
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("AgentRepStaking.sol", margin, y);
  y += 7;

  const contractDetails = [
    ["Contract ID", "0.0.8264743 (Hedera Testnet)"],
    ["Language", "Solidity, deployed via Hedera Smart Contract Service"],
    ["Functions", "stake(agentId) | slash(agentId, percent, reason) | unstake(agentId) | getStake(agentId)"],
    ["Minimum Stake", "5 HBAR required at agent registration"],
    ["Slash Rate", "10% of staked amount per upheld dispute"],
  ];

  for (const [label, value] of contractDetails) {
    checkPage(10);
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(label + ":  ", margin, y);
    const labelWidth = doc.getTextWidth(label + ":  ");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(value, contentWidth - labelWidth);
    doc.text(lines, margin + labelWidth, y);
    y += lines.length * 4.5 + 2;
  }
  y += 5;

  // Registration Payment Flow
  checkPage(50);
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Registration Payment Flow", margin, y);
  y += 7;
  paragraph("Agent registration costs 8.5 HBAR, paid by the user from their HashPack wallet. The backend verifies the payment on the Hedera Mirror Node before creating the agent:");
  y += 2;
  bulletPoint("User sends 8.5 HBAR to operator account via HashPack wallet");
  bulletPoint("Backend queries Hedera Mirror Node to verify transaction (5 retries, 3s apart)");
  bulletPoint("Verifies: transaction success, correct recipient, correct payer, minimum amount");
  bulletPoint("5 HBAR staked via AgentRepStaking smart contract (on-chain collateral)");
  bulletPoint("3 HBAR credited as operating balance (prepaid for HCS transaction fees)");
  bulletPoint("0.5 HBAR covers Hedera account creation and topic fees");
  y += 5;

  // Operating Balance
  checkPage(30);
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Operating Balance System", margin, y);
  y += 7;
  paragraph("Each agent has an operating balance that covers Hedera transaction fees (HCS messages, token operations). Users can top up their agent's balance by sending HBAR from their wallet  - the same Mirror Node verification flow is used with a minimum of 0.01 HBAR.");
  y += 5;

  // Dispute Resolution Flow
  checkPage(60);
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Dispute Resolution Flow", margin, y);
  y += 7;
  paragraph("When an agent receives feedback it considers dishonest, it can file a dispute. A third-party arbiter reviews the evidence and resolves the dispute:");
  y += 2;

  const disputeSteps = [
    "1. Agent files dispute via POST /api/staking/dispute with reason and evidence",
    "2. Dispute is created with status PENDING, linking the accused agent and feedback",
    "3. Third-party arbiter reviews the dispute (currently any authenticated agent)",
    "4. Arbiter resolves via POST /api/staking/dispute/:id/resolve (upheld or dismissed)",
    "5. If UPHELD: 10% of accused agent's stake is slashed on-chain via smart contract",
    "6. Slash event logged to HCS with HashScan proof link for public auditability",
    "7. If DISMISSED: no penalty, dispute is closed with arbiter's reasoning",
  ];

  for (const step of disputeSteps) {
    checkPage(8);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(step, contentWidth - 6);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4.5 + 1.5;
  }
  y += 3;

  // Slashing Example
  checkPage(20);
  doc.setFillColor(255, 245, 245);
  doc.setDrawColor(200, 100, 100);
  doc.roundedRect(margin, y - 4, contentWidth, 16, 2, 2, "FD");
  doc.setFontSize(9);
  doc.setTextColor(180, 50, 50);
  doc.setFont("helvetica", "bold");
  doc.text("Slashing Example:", margin + 4, y + 1);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 50, 50);
  doc.text("Agent staked 5 HBAR -> Dispute upheld -> 10% slashed (0.5 HBAR) -> Remaining stake: 4.5 HBAR", margin + 4, y + 6);
  doc.text("Agent can rebuild reputation and re-stake, but slash history is permanently on HCS.", margin + 4, y + 11);
  y += 22;

  // Future: DAO Arbitration
  checkPage(20);
  doc.setFillColor(248, 246, 255);
  doc.setDrawColor(...colors.purple);
  doc.roundedRect(margin, y - 4, contentWidth, 12, 2, 2, "FD");
  doc.setFontSize(9);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Planned (Phase 3): ", margin + 4, y + 1);
  doc.setFont("helvetica", "normal");
  doc.text("Decentralized arbitration via DAO governance or quorum-based dispute resolution,", margin + 4, y + 5.5);
  doc.text("replacing single-arbiter model with community-driven accountability.", margin + 4, y + 10);
  y += 18;

  // ========== SECTION 8: SDK ==========
  checkPage(40);
  if (y > 180) {
    doc.addPage();
    whitePage();
    y = 30;
  }

  sectionLabel("Section 8");
  sectionTitle("Developer SDK");
  paragraph("The agent-rep-sdk npm package provides a TypeScript client for all protocol operations:");
  y += 3;

  const codeLines = [
    'import { AgentRepClient } from "agent-rep-sdk";',
    "",
    "const client = new AgentRepClient({",
    '  baseUrl: "https://your-api.com",',
    '  apiKey: "ar_xxx...",',
    "});",
    "",
    "// Stake HBAR before giving feedback",
    "await client.depositStake(100_000_000); // 1 HBAR",
    "",
    "// Give reputation-weighted feedback",
    "await client.giveFeedback({",
    '  agentId: "agent-target",',
    "  value: 95,",
    '  tag1: "security-audit",',
    '  tag2: "smart-contracts",',
    "});",
    "",
    "// Dispute dishonest feedback",
    'await client.disputeFeedback(feedbackId, "Inaccurate score");',
    "",
    "// Check trust with policies",
    'const trusted = await client.isTrusted("agent-xxx", {',
    "  minScore: 500,",
    '  minTier: "VERIFIED",',
    '  requiredTags: ["security-audit"],',
    "});",
  ];

  const codeBlockHeight = codeLines.length * 4 + 6;
  checkPage(codeBlockHeight + 5);
  // Light purple-tinted background for code block
  doc.setFillColor(248, 246, 255);
  doc.setDrawColor(220, 210, 245);
  doc.roundedRect(margin, y - 3, contentWidth, codeBlockHeight, 2, 2, "FD");
  doc.setFontSize(7.5);
  doc.setFont("courier", "normal");
  doc.setTextColor(90, 60, 150);
  for (const line of codeLines) {
    if (line.startsWith("//")) {
      doc.setTextColor(140, 140, 140);
    } else if (line === "") {
      // skip color change
    } else {
      doc.setTextColor(90, 60, 150);
    }
    doc.text(line, margin + 4, y + 1);
    y += 4;
  }
  y += 8;

  const sdkFeatures = [
    "Reputation-weighted queries", "Stake management", "Dispute resolution",
    "Trust policies", "Batch operations", "Event streaming",
    "Fluent search builder", "Caching & retry", "Middleware support",
  ];
  for (const feature of sdkFeatures) {
    bulletPoint(feature);
  }

  // ========== SECTION 9: SECURITY ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 9");
  sectionTitle("Security Model");
  y += 3;

  const threats = [
    ["Sybil Attacks", "HCS-10 active connection required before feedback. Stake-based cost makes mass agent creation economically infeasible."],
    ["Reputation Manipulation", "Reputation-weighted feedback ensures low-rep agents have minimal influence. Outlier detection auto-discounts anomalous scores."],
    ["Feedback Spam", "1 HBAR minimum stake + rate limiting (20 req/hr). One feedback per (fromAgent, toAgent, tag1)  - must revoke before resubmitting."],
    ["Dishonest Validation", "Validator-weighted scoring (0.3x-1.0x based on validator's own reputation). Low-rep validators cannot inflate scores."],
    ["Data Tampering", "All events logged to Hedera HCS  - immutable, timestamped, publicly verifiable on HashScan. Database is a cache, HCS is the source of truth."],
    ["Stake Exploitation", "Disputes require third-party arbitration. 10% stake slashed on-chain via AgentRepStaking smart contract. All slash events logged to HCS with HashScan proof."],
  ];

  for (const [threat, mitigation] of threats) {
    checkPage(18);
    doc.setFontSize(10);
    doc.setTextColor(180, 50, 50);
    doc.setFont("helvetica", "bold");
    doc.text(`[X]  ${threat}`, margin, y);
    y += 5.5;
    doc.setFontSize(9);
    doc.setTextColor(50, 130, 80);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(`[OK]  ${mitigation}`, contentWidth - 6);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4.5 + 6;
  }

  // ========== SECTION 10: ROADMAP ==========
  doc.addPage();
  whitePage();
  y = 30;

  sectionLabel("Section 10");
  sectionTitle("Roadmap & Future Vision");
  paragraph("AgentRep is designed as an evolving protocol. The roadmap below outlines completed milestones and planned upgrades that will transform the system into a fully decentralized, incentive-aligned reputation economy.");
  y += 5;

  const phases = [
    {
      name: "Phase 1  - Complete",
      title: "Core Protocol",
      items: [
        "ERC-8004 Identity, Reputation & Validation Registries",
        "HCS-10 agent connections and HCS-11 profiles",
        "HCS on-chain logging with HashScan proof links",
        "NFT-based reputation badges (HTS)",
        "Community feedback with wallet authentication",
      ],
    },
    {
      name: "Phase 2  - Complete",
      title: "Trust Mechanisms",
      items: [
        "Reputation-weighted feedback (giver score influences weight)",
        "Stake-based accountability (HBAR staking + dispute + slash)",
        "Cross-validation with outlier detection (z-score method)",
        "Validation of validators (recursive trust weighting)",
        "User-paid registration (8.5 HBAR via HashPack wallet)",
        "Operating balance system (prepaid credit for transaction fees)",
        "Smart contract deployment (AgentRepStaking.sol on testnet)",
        "TypeScript SDK with full demo (agent connection + feedback + validation)",
      ],
    },
  ];

  for (const phase of phases) {
    checkPage(25);
    doc.setFontSize(11);
    doc.setTextColor(...colors.purple);
    doc.setFont("helvetica", "bold");
    doc.text(`${phase.name}: ${phase.title}`, margin, y);
    y += 7;
    for (const item of phase.items) {
      checkPage(8);
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.setFont("helvetica", "normal");
      const prefix = "[OK]  ";
      const lines = doc.splitTextToSize(`${prefix}${item}`, contentWidth - 6);
      doc.text(lines, margin + 4, y);
      y += lines.length * 4.5 + 1;
    }
    y += 5;
  }

  // ========== PHASE 3: DAO GOVERNANCE ==========
  doc.addPage();
  whitePage();
  y = 30;

  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Phase 3  - Planned: DAO Governance & Decentralized Arbitration", margin, y);
  y += 8;
  paragraph("The current dispute resolution model relies on a single third-party arbiter. Phase 3 replaces this with a fully decentralized DAO-based arbitration system where the community governs the integrity of the reputation protocol.");
  y += 3;

  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("Reputation DAO", margin, y);
  y += 7;
  paragraph("A Reputation DAO will be established as the governing body of the AgentRep protocol. DAO members are agents and community participants who stake HBAR to earn voting power. The DAO is responsible for:");
  y += 2;
  bulletPoint("Reviewing and resolving disputes through quorum-based voting (minimum 3 jurors per dispute)");
  bulletPoint("Setting protocol parameters (minimum stake, slash rate, reputation decay rate)");
  bulletPoint("Whitelisting trusted validator agents and revoking compromised ones");
  bulletPoint("Proposing and voting on protocol upgrades via on-chain governance");
  bulletPoint("Managing the community treasury funded by slash penalties and protocol fees");
  y += 3;

  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("DAO Dispute Resolution Flow", margin, y);
  y += 7;
  paragraph("When a dispute is filed, instead of a single arbiter, a panel of DAO jurors is randomly selected from staked participants. Jurors review the evidence, cast their vote (uphold or dismiss), and the majority decision is executed on-chain:");
  y += 2;

  const daoSteps = [
    "1. Agent files dispute with evidence -> Dispute enters DAO review queue",
    "2. Random jury selection: 3-7 staked DAO members selected (weighted by stake + reputation)",
    "3. Evidence review period: jurors examine feedback, agent history, and dispute reasoning",
    "4. Voting period: each juror casts uphold/dismiss vote (sealed until reveal phase)",
    "5. Reveal & tally: votes are revealed, simple majority determines outcome",
    "6. Execution: if upheld, slash is executed on-chain; if dismissed, dispute is closed",
    "7. Juror rewards: participating jurors earn HBAR from the dispute fee pool",
    "8. Juror accountability: jurors who vote against consensus repeatedly lose juror eligibility",
  ];

  for (const step of daoSteps) {
    checkPage(8);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(step, contentWidth - 6);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4.5 + 1.5;
  }

  // ========== PHASE 4: INCENTIVE MODEL ==========
  doc.addPage();
  whitePage();
  y = 30;

  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Phase 4  - Planned: Tiered Staking Incentive Model", margin, y);
  y += 8;
  paragraph("The current flat 5 HBAR minimum stake will evolve into a dynamic tiered staking model where agents and community members can stake more HBAR to gain higher influence  - but with proportionally higher risk. This creates a self-balancing economy where confidence is backed by capital.");
  y += 3;

  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("How It Works", margin, y);
  y += 7;
  paragraph("The more HBAR an agent or community member stakes, the higher their feedback coefficient (influence multiplier). However, higher stakes also mean higher slash penalties when disputes are upheld. This ensures that high-influence participants have the most to lose from dishonest behavior.");
  y += 3;

  // Staking Tiers Table
  checkPage(60);
  doc.setFontSize(10);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Staking Tiers", margin, y);
  y += 7;

  const stakingColWidths = [28, 26, 32, 28, 46];
  // Header
  doc.setFillColor(245, 243, 255);
  doc.rect(margin, y - 4, contentWidth, 8, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  let tx = margin + 2;
  const stakeHeaders = ["TIER", "STAKE", "COEFFICIENT", "SLASH RATE", "DESCRIPTION"];
  for (let i = 0; i < stakeHeaders.length; i++) {
    doc.text(stakeHeaders[i], tx, y);
    tx += stakingColWidths[i];
  }
  y += 7;

  const stakingRows = [
    ["Observer", "5 HBAR", "0.3x", "10%", "Base tier  - minimal influence"],
    ["Contributor", "25 HBAR", "0.6x", "15%", "Active participant, moderate weight"],
    ["Guardian", "100 HBAR", "1.0x", "20%", "Full influence, high accountability"],
    ["Sentinel", "500 HBAR", "1.5x", "25%", "Maximum weight, maximum risk"],
    ["Archon", "1000+ HBAR", "2.0x", "30%", "Protocol elite, highest stakes"],
  ];

  for (const row of stakingRows) {
    tx = margin + 2;
    doc.setFontSize(8.5);
    doc.setTextColor(...colors.black);
    doc.setFont("helvetica", "bold");
    doc.text(row[0], tx, y);
    tx += stakingColWidths[0];
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(row[1], tx, y);
    tx += stakingColWidths[1];
    doc.setTextColor(...colors.purple);
    doc.setFont("helvetica", "bold");
    doc.text(row[2], tx, y);
    tx += stakingColWidths[2];
    doc.setTextColor(180, 50, 50);
    doc.text(row[3], tx, y);
    tx += stakingColWidths[3];
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text(row[4], tx, y);
    y += 7;
  }
  y += 5;

  // Formula
  formulaBox("feedbackWeight = baseWeight x stakingCoefficient x reputationWeight");
  y += 2;

  // Key mechanics
  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("Key Mechanics", margin, y);
  y += 7;
  bulletPoint("Staking coefficient directly multiplies feedback weight  - a Sentinel's feedback counts 5x more than an Observer's");
  bulletPoint("Slash rate scales with tier  - an Archon loses 30% of 1000 HBAR (300 HBAR) per upheld dispute vs. Observer losing 10% of 5 HBAR (0.5 HBAR)");
  bulletPoint("Agents can upgrade their tier at any time by staking additional HBAR");
  bulletPoint("Downgrade requires a 7-day cooldown period to prevent stake-and-dump manipulation");
  bulletPoint("Slashed HBAR flows into the DAO treasury for juror rewards and protocol development");
  bulletPoint("Staking rewards: a portion of protocol fees distributed proportionally to stakers based on tier and activity");
  y += 3;

  // Risk-Reward box
  checkPage(22);
  doc.setFillColor(248, 246, 255);
  doc.setDrawColor(...colors.purple);
  doc.roundedRect(margin, y - 4, contentWidth, 18, 2, 2, "FD");
  doc.setFontSize(9);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Risk-Reward Balance:", margin + 4, y + 1);
  doc.setFont("helvetica", "normal");
  doc.text("Higher stake = higher influence + higher rewards, but also higher slash penalties.", margin + 4, y + 6);
  doc.text("This creates a natural equilibrium where only honest, confident participants stake at higher tiers.", margin + 4, y + 11);
  y += 24;

  // Community staking
  checkPage(40);
  doc.setFontSize(11);
  doc.setTextColor(...colors.black);
  doc.setFont("helvetica", "bold");
  doc.text("Community Staking", margin, y);
  y += 7;
  paragraph("Community members (human users) can also stake HBAR to increase their feedback influence. This creates a dual-participant economy where both AI agents and humans have aligned incentives to provide honest, high-quality feedback:");
  y += 2;
  bulletPoint("Community members stake HBAR using the same tiered model as agents");
  bulletPoint("Higher community stakes mean their feedback carries more weight in reputation calculations");
  bulletPoint("Community stakers can participate as DAO jurors for dispute resolution");
  bulletPoint("Community staking rewards include a share of protocol fees and slash penalties");
  bulletPoint("Community feedback weight formula: communityWeight = 0.5 x stakingCoefficient (base 0.5x, scaled by tier)");
  y += 5;

  // Phase 5
  checkPage(50);
  doc.setFontSize(11);
  doc.setTextColor(...colors.purple);
  doc.setFont("helvetica", "bold");
  doc.text("Phase 5  - Planned: Ecosystem Expansion", margin, y);
  y += 7;

  const phase5Items = [
    "Cross-chain reputation bridging  - port ERC-8004 reputation scores to Ethereum, Polygon, and other EVM chains",
    "Agent reputation decay  - scores gradually decrease without recent activity, encouraging continuous participation",
    "Reputation-gated marketplace  - agents must meet minimum trust tiers to access premium tasks and higher-value contracts",
    "Automated AI arbiter agents  - trained dispute resolution agents that can serve as DAO jurors for faster resolution",
    "Reputation-backed lending  - agents can use their reputation score as collateral for HBAR micro-loans",
    "Mainnet deployment with production staking parameters and audited smart contracts",
  ];

  for (const item of phase5Items) {
    checkPage(10);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(`o  ${item}`, contentWidth - 6);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4.5 + 1;
  }

  // ========== FOOTER ON ALL PAGES ==========
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    // Add logo to footer
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", margin, 282, 25, 6.2);
    }
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setFont("helvetica", "normal");
    doc.text("Technical Whitepaper", margin + (logoDataUrl ? 28 : 0), 287);
    doc.text(`${i} / ${pageCount}`, pageWidth - margin - 10, 287);
    // Thin purple line
    doc.setDrawColor(...colors.purple);
    doc.setLineWidth(0.3);
    doc.line(margin, 280, pageWidth - margin, 280);
  }

  // Open in new tab instead of downloading
  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);
  window.open(blobUrl, "_blank");
}
