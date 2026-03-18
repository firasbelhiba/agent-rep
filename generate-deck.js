const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Icons from react-icons
const { FaExclamationTriangle, FaShieldAlt, FaLink, FaCogs, FaCheckCircle, FaUserShield,
        FaCoins, FaComments, FaUsers, FaGavel, FaCode, FaLayerGroup, FaServer, FaDatabase,
        FaGlobe, FaRocket, FaStar, FaLock, FaChartLine, FaHandshake, FaArrowRight,
        FaFileContract, FaCubes, FaNetworkWired, FaEye } = require("react-icons/fa");

// ---- Config ----
const BG = "0d0d1a";
const PRIMARY = "8259ef";
const LIGHT_PURPLE = "b47aff";
const WHITE = "FFFFFF";
const LIGHT_GRAY = "cccccc";
const MID_GRAY = "999999";
const DARK_CARD = "1a1a2e";
const CARD_BG = "16162a";
const LOGO_PATH = path.resolve(__dirname, "public/logo-trimmed.png");
const OUTPUT_PATH = path.resolve(__dirname, "AgentRep-PitchDeck.pptx");

// ---- Icon helper ----
function renderIconSvg(IconComponent, color = "#FFFFFF", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// Factory functions for reusable options (avoid mutation pitfall)
const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.3 });
const makeCardShadow = () => ({ type: "outer", blur: 4, offset: 1, angle: 135, color: "000000", opacity: 0.25 });

// ---- Slide helper functions ----
function addSlideNumber(slide, num) {
  slide.addText(String(num), {
    x: 9.3, y: 5.15, w: 0.5, h: 0.35,
    fontSize: 9, color: MID_GRAY, fontFace: "Calibri", align: "right"
  });
}

function addFooterLine(slide) {
  slide.addShape("line", {
    x: 0.5, y: 5.1, w: 9, h: 0,
    line: { color: PRIMARY, width: 0.5, transparency: 60 }
  });
}

function addSectionTitle(slide, title, subtitle) {
  // Purple accent line
  slide.addShape("rectangle", {
    x: 0.5, y: 0.35, w: 0.06, h: 0.45,
    fill: { color: PRIMARY }
  });
  slide.addText(title, {
    x: 0.7, y: 0.25, w: 8, h: 0.55,
    fontSize: 28, fontFace: "Arial Black", color: WHITE, bold: true, margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.7, y: 0.8, w: 8, h: 0.35,
      fontSize: 13, fontFace: "Calibri", color: LIGHT_GRAY, margin: 0
    });
  }
}

async function main() {
  // Pre-render all icons
  const icons = {};
  const iconMap = {
    warning: [FaExclamationTriangle, "#ff6b6b"],
    shield: [FaShieldAlt, "#" + PRIMARY],
    link: [FaLink, "#" + LIGHT_PURPLE],
    cogs: [FaCogs, "#" + PRIMARY],
    check: [FaCheckCircle, "#4ade80"],
    userShield: [FaUserShield, "#" + PRIMARY],
    coins: [FaCoins, "#fbbf24"],
    comments: [FaComments, "#" + LIGHT_PURPLE],
    users: [FaUsers, "#60a5fa"],
    gavel: [FaGavel, "#f97316"],
    code: [FaCode, "#4ade80"],
    layers: [FaLayerGroup, "#" + PRIMARY],
    server: [FaServer, "#" + LIGHT_PURPLE],
    database: [FaDatabase, "#60a5fa"],
    globe: [FaGlobe, "#" + PRIMARY],
    rocket: [FaRocket, "#" + LIGHT_PURPLE],
    star: [FaStar, "#fbbf24"],
    lock: [FaLock, "#ff6b6b"],
    chart: [FaChartLine, "#4ade80"],
    handshake: [FaHandshake, "#" + PRIMARY],
    arrow: [FaArrowRight, "#" + LIGHT_PURPLE],
    contract: [FaFileContract, "#" + PRIMARY],
    cubes: [FaCubes, "#" + LIGHT_PURPLE],
    network: [FaNetworkWired, "#60a5fa"],
    eye: [FaEye, "#" + PRIMARY],
  };

  for (const [key, [Component, color]] of Object.entries(iconMap)) {
    icons[key] = await iconToBase64Png(Component, color, 256);
  }

  // ---- Create presentation ----
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "AgentRep Team";
  pres.title = "AgentRep - On-Chain Reputation for AI Agents";

  // ============================================================
  // SLIDE 1: Title
  // ============================================================
  let slide = pres.addSlide();
  slide.background = { color: BG };

  // Subtle purple gradient accent shape at top
  slide.addShape("rectangle", {
    x: 0, y: 0, w: 10, h: 0.06,
    fill: { color: PRIMARY }
  });

  // Large decorative circle (background element)
  slide.addShape("oval", {
    x: 6.5, y: -1.0, w: 5, h: 5,
    fill: { color: PRIMARY, transparency: 92 }
  });
  slide.addShape("oval", {
    x: 7.0, y: -0.5, w: 4, h: 4,
    fill: { color: LIGHT_PURPLE, transparency: 94 }
  });

  // Logo
  slide.addImage({
    path: LOGO_PATH,
    x: 3.5, y: 0.5, w: 3, h: 3,
    sizing: { type: "contain", w: 3, h: 3 }
  });

  // Title
  slide.addText("AgentRep", {
    x: 0.5, y: 3.3, w: 9, h: 0.8,
    fontSize: 44, fontFace: "Arial Black", color: WHITE, bold: true, align: "center", margin: 0
  });

  // Tagline
  slide.addText("On-Chain Reputation for AI Agents", {
    x: 0.5, y: 4.0, w: 9, h: 0.5,
    fontSize: 20, fontFace: "Calibri", color: LIGHT_PURPLE, align: "center", margin: 0
  });

  // Built on Hedera
  slide.addText("Built on Hedera", {
    x: 0.5, y: 4.5, w: 9, h: 0.4,
    fontSize: 14, fontFace: "Calibri", color: MID_GRAY, align: "center", margin: 0
  });

  // Website
  slide.addText("agentrep.xyz", {
    x: 0.5, y: 5.0, w: 9, h: 0.35,
    fontSize: 12, fontFace: "Calibri", color: LIGHT_GRAY, align: "center", margin: 0
  });

  // ============================================================
  // SLIDE 2: The Problem
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "The Problem", "AI agents are proliferating — but trust is missing");
  addFooterLine(slide);
  addSlideNumber(slide, 2);

  const problems = [
    { icon: icons.lock, title: "No Verifiable Trust", desc: "There's no way to verify if an AI agent is reliable before interacting with it" },
    { icon: icons.warning, title: "No Track Record", desc: "Agents operate without history — every interaction is a blind leap of faith" },
    { icon: icons.eye, title: "No Accountability", desc: "Bad actors face zero consequences — there's no system to penalize malicious agents" },
  ];

  problems.forEach((p, i) => {
    const x = 0.5 + i * 3.1;
    const y = 1.5;
    // Card background
    slide.addShape("rectangle", {
      x: x, y: y, w: 2.8, h: 3.2,
      fill: { color: CARD_BG },
      shadow: makeCardShadow()
    });
    // Purple top accent
    slide.addShape("rectangle", {
      x: x, y: y, w: 2.8, h: 0.05,
      fill: { color: PRIMARY }
    });
    // Icon
    slide.addImage({ data: p.icon, x: x + 1.0, y: y + 0.4, w: 0.7, h: 0.7 });
    // Title
    slide.addText(p.title, {
      x: x + 0.2, y: y + 1.3, w: 2.4, h: 0.45,
      fontSize: 15, fontFace: "Arial Black", color: WHITE, bold: true, align: "center", margin: 0
    });
    // Description
    slide.addText(p.desc, {
      x: x + 0.2, y: y + 1.8, w: 2.4, h: 1.0,
      fontSize: 11, fontFace: "Calibri", color: LIGHT_GRAY, align: "center", margin: 0
    });
  });

  // ============================================================
  // SLIDE 3: The Solution
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "The Solution");
  addFooterLine(slide);
  addSlideNumber(slide, 3);

  // Main solution statement
  slide.addText("AgentRep: A Decentralized Trust Layer for Autonomous AI", {
    x: 0.7, y: 1.3, w: 8.5, h: 0.6,
    fontSize: 22, fontFace: "Arial Black", color: LIGHT_PURPLE, bold: true, margin: 0
  });

  const solutionPoints = [
    { icon: icons.contract, text: "Inspired by the ERC-8004 standard for on-chain reputation" },
    { icon: icons.check, text: "Real feedback from real interactions — validated and weighted" },
    { icon: icons.shield, text: "All reputation data recorded immutably on Hedera Hashgraph" },
    { icon: icons.handshake, text: "Stake-based accountability — agents put skin in the game" },
  ];

  solutionPoints.forEach((sp, i) => {
    const y = 2.2 + i * 0.75;
    slide.addImage({ data: sp.icon, x: 0.9, y: y + 0.05, w: 0.4, h: 0.4 });
    slide.addText(sp.text, {
      x: 1.5, y: y, w: 7.5, h: 0.5,
      fontSize: 14, fontFace: "Calibri", color: WHITE, valign: "middle", margin: 0
    });
  });

  // ============================================================
  // SLIDE 4: How It Works
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "How It Works", "Four steps to verifiable AI reputation");
  addFooterLine(slide);
  addSlideNumber(slide, 4);

  const steps = [
    { num: "1", icon: icons.globe, title: "Register", desc: "Register your agent on-chain via HCS-10 protocol" },
    { num: "2", icon: icons.coins, title: "Stake", desc: "Stake HBAR as collateral to signal commitment" },
    { num: "3", icon: icons.comments, title: "Interact", desc: "Interact with other agents and receive feedback" },
    { num: "4", icon: icons.chart, title: "Build Rep", desc: "Build verifiable reputation scored 0-1000" },
  ];

  steps.forEach((s, i) => {
    const x = 0.3 + i * 2.45;
    const y = 1.5;
    // Card
    slide.addShape("rectangle", {
      x: x, y: y, w: 2.2, h: 3.3,
      fill: { color: CARD_BG },
      shadow: makeCardShadow()
    });
    // Step number circle
    slide.addShape("oval", {
      x: x + 0.75, y: y + 0.3, w: 0.7, h: 0.7,
      fill: { color: PRIMARY }
    });
    slide.addText(s.num, {
      x: x + 0.75, y: y + 0.3, w: 0.7, h: 0.7,
      fontSize: 22, fontFace: "Arial Black", color: WHITE, bold: true, align: "center", valign: "middle", margin: 0
    });
    // Icon
    slide.addImage({ data: s.icon, x: x + 0.75, y: y + 1.2, w: 0.7, h: 0.7 });
    // Title
    slide.addText(s.title, {
      x: x + 0.1, y: y + 2.1, w: 2.0, h: 0.4,
      fontSize: 15, fontFace: "Arial Black", color: LIGHT_PURPLE, bold: true, align: "center", margin: 0
    });
    // Description
    slide.addText(s.desc, {
      x: x + 0.1, y: y + 2.5, w: 2.0, h: 0.7,
      fontSize: 10.5, fontFace: "Calibri", color: LIGHT_GRAY, align: "center", margin: 0
    });

    // Arrow between steps
    if (i < 3) {
      slide.addImage({ data: icons.arrow, x: x + 2.15, y: y + 1.35, w: 0.35, h: 0.35 });
    }
  });

  // ============================================================
  // SLIDE 5: Architecture
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "Architecture", "Three-layer stack powering AgentRep");
  addFooterLine(slide);
  addSlideNumber(slide, 5);

  const layers = [
    {
      icon: icons.globe, title: "Frontend (Next.js)", color: PRIMARY,
      items: ["Agent Explorer", "Registration Flow", "Leaderboard & Analytics"]
    },
    {
      icon: icons.server, title: "Backend (NestJS)", color: LIGHT_PURPLE,
      items: ["Reputation Engine", "Feedback Processing", "Validation & Staking"]
    },
    {
      icon: icons.database, title: "Hedera Hashgraph", color: "60a5fa",
      items: ["HCS Topics", "Smart Contract", "Mirror Node Queries"]
    },
  ];

  layers.forEach((layer, i) => {
    const y = 1.35 + i * 1.3;
    // Layer bar
    slide.addShape("rectangle", {
      x: 0.5, y: y, w: 9, h: 1.1,
      fill: { color: CARD_BG },
      shadow: makeCardShadow()
    });
    // Left accent
    slide.addShape("rectangle", {
      x: 0.5, y: y, w: 0.06, h: 1.1,
      fill: { color: layer.color }
    });
    // Icon
    slide.addImage({ data: layer.icon, x: 0.8, y: y + 0.25, w: 0.55, h: 0.55 });
    // Title
    slide.addText(layer.title, {
      x: 1.5, y: y + 0.1, w: 3, h: 0.4,
      fontSize: 16, fontFace: "Arial Black", color: WHITE, bold: true, margin: 0
    });
    // Items
    slide.addText(layer.items.join("   |   "), {
      x: 1.5, y: y + 0.55, w: 7.5, h: 0.4,
      fontSize: 12, fontFace: "Calibri", color: LIGHT_GRAY, margin: 0
    });
  });

  // Connection arrows
  slide.addText("▼", { x: 4.7, y: 2.45, w: 0.5, h: 0.3, fontSize: 16, color: PRIMARY, align: "center", margin: 0 });
  slide.addText("▼", { x: 4.7, y: 3.75, w: 0.5, h: 0.3, fontSize: 16, color: PRIMARY, align: "center", margin: 0 });

  // ============================================================
  // SLIDE 6: Key Features
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "Key Features");
  addFooterLine(slide);
  addSlideNumber(slide, 6);

  const features = [
    { icon: icons.chart, title: "Reputation Scoring", desc: "0-1000 weighted algorithm based on feedback quality and history" },
    { icon: icons.coins, title: "Staking & Slashing", desc: "HBAR collateral via smart contract — bad actors lose their stake" },
    { icon: icons.comments, title: "HCS-10 Messaging", desc: "Agent-to-agent communication on Hedera Consensus Service" },
    { icon: icons.users, title: "Community Reviews", desc: "Wallet-verified human feedback with on-chain validation" },
    { icon: icons.gavel, title: "Dispute Resolution", desc: "On-chain arbitration process for contested interactions" },
    { icon: icons.code, title: "Developer SDK", desc: "npm package: agent-rep-sdk for easy integration" },
  ];

  features.forEach((f, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.4 + col * 3.15;
    const y = 1.25 + row * 2.05;
    // Card
    slide.addShape("rectangle", {
      x: x, y: y, w: 2.95, h: 1.85,
      fill: { color: CARD_BG },
      shadow: makeCardShadow()
    });
    // Icon
    slide.addImage({ data: f.icon, x: x + 0.2, y: y + 0.25, w: 0.45, h: 0.45 });
    // Title
    slide.addText(f.title, {
      x: x + 0.75, y: y + 0.25, w: 2.0, h: 0.4,
      fontSize: 13, fontFace: "Arial Black", color: LIGHT_PURPLE, bold: true, valign: "middle", margin: 0
    });
    // Description
    slide.addText(f.desc, {
      x: x + 0.2, y: y + 0.85, w: 2.55, h: 0.8,
      fontSize: 10.5, fontFace: "Calibri", color: LIGHT_GRAY, margin: 0
    });
  });

  // ============================================================
  // SLIDE 7: On-Chain Proof
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "On-Chain Proof", "Everything is verifiable on Hedera");
  addFooterLine(slide);
  addSlideNumber(slide, 7);

  const proofs = [
    { label: "Smart Contract", value: "0.0.8264743", note: "Source-verified on Sourcify" },
    { label: "HCS Identity Topic", value: "0.0.8264956", note: "" },
    { label: "HCS Feedback Topic", value: "0.0.8264959", note: "" },
    { label: "HCS Validation Topic", value: "0.0.8264962", note: "" },
  ];

  proofs.forEach((p, i) => {
    const y = 1.4 + i * 0.9;
    // Row background
    slide.addShape("rectangle", {
      x: 0.5, y: y, w: 9, h: 0.75,
      fill: { color: i % 2 === 0 ? CARD_BG : DARK_CARD }
    });
    // Label
    slide.addText(p.label, {
      x: 0.7, y: y, w: 3, h: 0.75,
      fontSize: 14, fontFace: "Arial Black", color: LIGHT_PURPLE, bold: true, valign: "middle", margin: 0
    });
    // Value
    slide.addText(p.value, {
      x: 3.8, y: y, w: 3, h: 0.75,
      fontSize: 14, fontFace: "Calibri", color: WHITE, valign: "middle", fontFace: "Consolas", margin: 0
    });
    // Note
    if (p.note) {
      slide.addText(p.note, {
        x: 7, y: y, w: 2.3, h: 0.75,
        fontSize: 10, fontFace: "Calibri", color: MID_GRAY, valign: "middle", italic: true, margin: 0
      });
    }
  });

  // Bottom note
  slide.addText("All feedback and validations are logged immutably on Hedera Consensus Service", {
    x: 0.5, y: 5.0, w: 9, h: 0.3,
    fontSize: 11, fontFace: "Calibri", color: LIGHT_GRAY, align: "center", margin: 0
  });

  // ============================================================
  // SLIDE 8: Tech Stack
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "Tech Stack");
  addFooterLine(slide);
  addSlideNumber(slide, 8);

  const techItems = [
    { icon: icons.cubes, title: "Hedera Hashgraph", desc: "HCS-10 Protocol & Smart Contracts", col: PRIMARY },
    { icon: icons.globe, title: "Next.js", desc: "React-based frontend framework", col: LIGHT_PURPLE },
    { icon: icons.server, title: "NestJS", desc: "Scalable Node.js backend", col: "60a5fa" },
    { icon: icons.database, title: "PostgreSQL + TypeORM", desc: "Relational data & ORM layer", col: "4ade80" },
    { icon: icons.contract, title: "ERC-8004 Standard", desc: "On-chain reputation specification", col: "fbbf24" },
    { icon: icons.code, title: "SDK on npm", desc: "agent-rep-sdk package", col: "f97316" },
  ];

  techItems.forEach((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.4 + col * 3.15;
    const y = 1.25 + row * 2.05;
    // Card
    slide.addShape("rectangle", {
      x: x, y: y, w: 2.95, h: 1.85,
      fill: { color: CARD_BG },
      shadow: makeCardShadow()
    });
    // Top accent line
    slide.addShape("rectangle", {
      x: x, y: y, w: 2.95, h: 0.04,
      fill: { color: t.col }
    });
    // Icon
    slide.addImage({ data: t.icon, x: x + 1.1, y: y + 0.25, w: 0.6, h: 0.6 });
    // Title
    slide.addText(t.title, {
      x: x + 0.15, y: y + 1.0, w: 2.65, h: 0.35,
      fontSize: 13, fontFace: "Arial Black", color: WHITE, bold: true, align: "center", margin: 0
    });
    // Desc
    slide.addText(t.desc, {
      x: x + 0.15, y: y + 1.35, w: 2.65, h: 0.35,
      fontSize: 10.5, fontFace: "Calibri", color: LIGHT_GRAY, align: "center", margin: 0
    });
  });

  // ============================================================
  // SLIDE 9: Live Demo
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };
  addSectionTitle(slide, "Live Demo", "Try it now at agentrep.xyz");
  addFooterLine(slide);
  addSlideNumber(slide, 9);

  // Website URL prominent
  slide.addText("agentrep.xyz", {
    x: 0.5, y: 1.4, w: 9, h: 0.6,
    fontSize: 32, fontFace: "Arial Black", color: LIGHT_PURPLE, bold: true, align: "center", margin: 0,
    hyperlink: { url: "https://agentrep.xyz" }
  });

  slide.addText("Live on Hedera Testnet", {
    x: 0.5, y: 2.0, w: 9, h: 0.35,
    fontSize: 14, fontFace: "Calibri", color: MID_GRAY, align: "center", margin: 0
  });

  const demoFeatures = [
    { icon: icons.userShield, title: "Agent Registration", desc: "Register agents with HBAR staking on testnet" },
    { icon: icons.chart, title: "Reputation Scoring", desc: "Real-time weighted reputation from 0-1000" },
    { icon: icons.comments, title: "Agent Messaging", desc: "Agent-to-agent communication via HCS-10" },
    { icon: icons.star, title: "Leaderboard", desc: "Explore top-rated agents and their history" },
  ];

  demoFeatures.forEach((df, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 4.5;
    const y = 2.7 + row * 1.2;
    // Card
    slide.addShape("rectangle", {
      x: x, y: y, w: 4.1, h: 1.0,
      fill: { color: CARD_BG },
      shadow: makeCardShadow()
    });
    // Icon
    slide.addImage({ data: df.icon, x: x + 0.15, y: y + 0.2, w: 0.5, h: 0.5 });
    // Title
    slide.addText(df.title, {
      x: x + 0.8, y: y + 0.1, w: 3.1, h: 0.35,
      fontSize: 13, fontFace: "Arial Black", color: WHITE, bold: true, margin: 0
    });
    // Desc
    slide.addText(df.desc, {
      x: x + 0.8, y: y + 0.5, w: 3.1, h: 0.35,
      fontSize: 10.5, fontFace: "Calibri", color: LIGHT_GRAY, margin: 0
    });
  });

  // ============================================================
  // SLIDE 10: Thank You / Contact
  // ============================================================
  slide = pres.addSlide();
  slide.background = { color: BG };

  // Purple accent top
  slide.addShape("rectangle", {
    x: 0, y: 0, w: 10, h: 0.06,
    fill: { color: PRIMARY }
  });

  // Decorative circles
  slide.addShape("oval", {
    x: -1.5, y: 3.0, w: 4, h: 4,
    fill: { color: PRIMARY, transparency: 93 }
  });
  slide.addShape("oval", {
    x: 7.5, y: -1.5, w: 4, h: 4,
    fill: { color: LIGHT_PURPLE, transparency: 93 }
  });

  // Logo
  slide.addImage({
    path: LOGO_PATH,
    x: 3.75, y: 0.5, w: 2.5, h: 2.5,
    sizing: { type: "contain", w: 2.5, h: 2.5 }
  });

  // Title
  slide.addText("AgentRep", {
    x: 0.5, y: 2.9, w: 9, h: 0.7,
    fontSize: 40, fontFace: "Arial Black", color: WHITE, bold: true, align: "center", margin: 0
  });

  // Tagline
  slide.addText("On-Chain Reputation for AI Agents", {
    x: 0.5, y: 3.5, w: 9, h: 0.4,
    fontSize: 18, fontFace: "Calibri", color: LIGHT_PURPLE, align: "center", margin: 0
  });

  // Website
  slide.addText("agentrep.xyz", {
    x: 0.5, y: 4.1, w: 9, h: 0.4,
    fontSize: 16, fontFace: "Calibri", color: WHITE, align: "center", margin: 0,
    hyperlink: { url: "https://agentrep.xyz" }
  });

  // Built on Hedera
  slide.addShape("rectangle", {
    x: 3.5, y: 4.65, w: 3, h: 0.4,
    fill: { color: PRIMARY, transparency: 70 },
  });
  slide.addText("Built on Hedera", {
    x: 3.5, y: 4.65, w: 3, h: 0.4,
    fontSize: 13, fontFace: "Calibri", color: WHITE, align: "center", valign: "middle", margin: 0
  });

  // Hackathon note
  slide.addText("Hackathon Submission", {
    x: 0.5, y: 5.15, w: 9, h: 0.3,
    fontSize: 10, fontFace: "Calibri", color: MID_GRAY, align: "center", margin: 0
  });

  // ---- Write file ----
  await pres.writeFile({ fileName: OUTPUT_PATH });
  console.log("Presentation saved to: " + OUTPUT_PATH);
}

main().catch(err => {
  console.error("Error generating presentation:", err);
  process.exit(1);
});
