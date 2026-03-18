const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Icon imports
const {
  FaShieldAlt, FaExclamationTriangle, FaQuestionCircle,
  FaLink, FaCoins, FaComments, FaStar, FaGavel, FaCode,
  FaRocket, FaGlobe, FaUsers, FaChartLine, FaCogs,
  FaCheckCircle, FaPlay, FaGithub, FaNpm, FaDatabase,
  FaServer, FaDesktop, FaLock, FaNetworkWired, FaBrain,
  FaHandshake, FaEye, FaBalanceScale, FaCubes, FaArrowRight,
  FaUserShield, FaClipboardCheck, FaLightbulb, FaBook,
  FaYoutube, FaExternalLinkAlt, FaTrophy, FaRegHandshake
} = require("react-icons/fa");

// ── Theme constants ──
const BG = "0d0d1a";
const PRIMARY = "8259ef";
const LIGHT_PURPLE = "b47aff";
const WHITE = "FFFFFF";
const GRAY = "9999aa";
const DARK_CARD = "1a1a2e";
const CARD_BORDER = "2a2a4a";
const TITLE_FONT = "Arial Black";
const BODY_FONT = "Calibri";

const LOGO_PATH = path.resolve(__dirname, "public/logo-trimmed.png");
const OUTPUT_PATH = path.resolve(__dirname, "AgentRep-PitchDeck.pptx");

// ── Icon helper ──
function renderIconSvg(IconComponent, color = "#FFFFFF", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color = "#FFFFFF", size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// Helper: create shadow (fresh each time to avoid mutation issues)
function cardShadow() {
  return { type: "outer", color: "000000", blur: 8, offset: 2, angle: 135, opacity: 0.3 };
}

function addSlideNumber(slide, num, total) {
  slide.addText(`${num} / ${total}`, {
    x: 8.8, y: 5.25, w: 1, h: 0.3,
    fontSize: 9, color: GRAY, fontFace: BODY_FONT, align: "right"
  });
}

function addFooterBar(slide) {
  slide.addShape("rectangle", {
    x: 0, y: 5.35, w: 10, h: 0.275,
    fill: { color: PRIMARY }
  });
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Firas Belhiba";
  pres.title = "AgentRep - On-Chain Reputation for AI Agents";
  const TOTAL_SLIDES = 11;

  // Pre-render all icons
  const icons = {};
  const iconMap = {
    shield: [FaShieldAlt, "#" + LIGHT_PURPLE],
    warning: [FaExclamationTriangle, "#ff6b6b"],
    question: [FaQuestionCircle, "#ffa94d"],
    lock: [FaLock, "#ff8787"],
    link: [FaLink, "#" + LIGHT_PURPLE],
    coins: [FaCoins, "#ffd43b"],
    comments: [FaComments, "#" + LIGHT_PURPLE],
    star: [FaStar, "#ffd43b"],
    gavel: [FaGavel, "#" + LIGHT_PURPLE],
    code: [FaCode, "#" + LIGHT_PURPLE],
    rocket: [FaRocket, "#" + LIGHT_PURPLE],
    globe: [FaGlobe, "#" + LIGHT_PURPLE],
    users: [FaUsers, "#" + LIGHT_PURPLE],
    chart: [FaChartLine, "#" + LIGHT_PURPLE],
    cogs: [FaCogs, "#" + LIGHT_PURPLE],
    check: [FaCheckCircle, "#51cf66"],
    play: [FaPlay, "#" + WHITE],
    github: [FaGithub, "#" + WHITE],
    npm: [FaNpm, "#cc3534"],
    database: [FaDatabase, "#" + LIGHT_PURPLE],
    server: [FaServer, "#" + LIGHT_PURPLE],
    desktop: [FaDesktop, "#" + LIGHT_PURPLE],
    network: [FaNetworkWired, "#" + LIGHT_PURPLE],
    brain: [FaBrain, "#" + LIGHT_PURPLE],
    handshake: [FaHandshake, "#" + LIGHT_PURPLE],
    eye: [FaEye, "#" + LIGHT_PURPLE],
    balance: [FaBalanceScale, "#" + LIGHT_PURPLE],
    cubes: [FaCubes, "#" + LIGHT_PURPLE],
    arrow: [FaArrowRight, "#" + LIGHT_PURPLE],
    userShield: [FaUserShield, "#" + LIGHT_PURPLE],
    clipboard: [FaClipboardCheck, "#" + LIGHT_PURPLE],
    lightbulb: [FaLightbulb, "#ffd43b"],
    book: [FaBook, "#" + LIGHT_PURPLE],
    youtube: [FaYoutube, "#ff0000"],
    extLink: [FaExternalLinkAlt, "#" + LIGHT_PURPLE],
    trophy: [FaTrophy, "#ffd43b"],
    shieldWhite: [FaShieldAlt, "#" + WHITE],
    coinsWhite: [FaCoins, "#" + WHITE],
    commentsWhite: [FaComments, "#" + WHITE],
    starWhite: [FaStar, "#" + WHITE],
    gavelWhite: [FaGavel, "#" + WHITE],
    codeWhite: [FaCode, "#" + WHITE],
    arrowWhite: [FaArrowRight, "#" + WHITE],
    checkWhite: [FaCheckCircle, "#" + WHITE],
    rocketWhite: [FaRocket, "#" + WHITE],
  };

  for (const [key, [Icon, color]] of Object.entries(iconMap)) {
    icons[key] = await iconToBase64Png(Icon, color, 256);
  }

  // ════════════════════════════════════════════
  // SLIDE 1: Title
  // ════════════════════════════════════════════
  let slide = pres.addSlide();
  slide.background = { color: BG };

  // Subtle gradient-like effect with shapes
  slide.addShape("rectangle", {
    x: 0, y: 0, w: 10, h: 5.625,
    fill: { color: PRIMARY, transparency: 95 }
  });

  // Top accent line
  slide.addShape("rectangle", {
    x: 0, y: 0, w: 10, h: 0.04,
    fill: { color: PRIMARY }
  });

  // Logo centered
  slide.addImage({
    path: LOGO_PATH,
    x: 3.5, y: 0.6, w: 3, h: 3,
    sizing: { type: "contain", w: 3, h: 3 }
  });

  // Tagline
  slide.addText("On-Chain Reputation for AI Agents", {
    x: 1, y: 3.5, w: 8, h: 0.6,
    fontSize: 22, fontFace: BODY_FONT, color: LIGHT_PURPLE,
    align: "center", bold: true
  });

  // Built on Hedera
  slide.addText("Built on Hedera", {
    x: 1, y: 4.1, w: 8, h: 0.4,
    fontSize: 14, fontFace: BODY_FONT, color: GRAY,
    align: "center"
  });

  // Website
  slide.addText("agentrep.xyz", {
    x: 1, y: 4.55, w: 8, h: 0.35,
    fontSize: 13, fontFace: BODY_FONT, color: PRIMARY,
    align: "center",
    hyperlink: { url: "https://agentrep.xyz" }
  });

  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 2: Team
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("The Team", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });

  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  // Team card
  slide.addShape("rectangle", {
    x: 1, y: 1.5, w: 8, h: 3.2,
    fill: { color: DARK_CARD },
    shadow: cardShadow(),
    line: { color: CARD_BORDER, width: 1 }
  });

  // Left accent
  slide.addShape("rectangle", {
    x: 1, y: 1.5, w: 0.06, h: 3.2,
    fill: { color: PRIMARY }
  });

  // Name
  slide.addText("Firas Belhiba", {
    x: 1.5, y: 1.7, w: 7, h: 0.5,
    fontSize: 24, fontFace: TITLE_FONT, color: WHITE, bold: true, margin: 0
  });

  // Role
  slide.addText("Full-Stack Blockchain Developer", {
    x: 1.5, y: 2.2, w: 7, h: 0.4,
    fontSize: 16, fontFace: BODY_FONT, color: PRIMARY, margin: 0
  });

  // Company
  slide.addText("Dar Blockchain", {
    x: 1.5, y: 2.6, w: 7, h: 0.35,
    fontSize: 14, fontFace: BODY_FONT, color: GRAY, margin: 0
  });

  // Bio
  slide.addText("Solo developer with deep experience in Hedera ecosystem, Solidity smart contracts, Next.js frontend development, and NestJS backend architecture. Built AgentRep end-to-end as a complete decentralized reputation platform for AI agents.", {
    x: 1.5, y: 3.1, w: 7, h: 1.2,
    fontSize: 13, fontFace: BODY_FONT, color: "ccccdd", paraSpaceAfter: 6, margin: 0
  });

  // Tech badges
  const badges = ["Hedera", "Solidity", "Next.js", "NestJS", "TypeScript"];
  let badgeX = 1.5;
  for (const badge of badges) {
    const bw = badge.length * 0.1 + 0.4;
    slide.addShape("rectangle", {
      x: badgeX, y: 4.15, w: bw, h: 0.32,
      fill: { color: PRIMARY, transparency: 70 },
      line: { color: PRIMARY, width: 0.5 }
    });
    slide.addText(badge, {
      x: badgeX, y: 4.15, w: bw, h: 0.32,
      fontSize: 10, fontFace: BODY_FONT, color: LIGHT_PURPLE,
      align: "center", valign: "middle", margin: 0
    });
    badgeX += bw + 0.15;
  }

  addSlideNumber(slide, 2, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 3: The Problem
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("The Problem", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  slide.addText("AI agents are proliferating, but there is no way to know which ones to trust.", {
    x: 0.5, y: 1.15, w: 9, h: 0.5,
    fontSize: 14, fontFace: BODY_FONT, color: GRAY, margin: 0
  });

  // 3 problem cards
  const problems = [
    { icon: "lock", title: "No Verifiable Trust", desc: "AI agents operate without any on-chain identity or trust score. Users have zero way to verify reliability." },
    { icon: "question", title: "No Track Record", desc: "Agents complete tasks with no persistent history. Past performance is invisible and unverifiable." },
    { icon: "warning", title: "No Accountability", desc: "When agents fail or act maliciously, there are no consequences. No staking, no slashing, no recourse." }
  ];

  for (let i = 0; i < 3; i++) {
    const cx = 0.5 + i * 3.1;
    // Card bg
    slide.addShape("rectangle", {
      x: cx, y: 1.9, w: 2.8, h: 3.0,
      fill: { color: DARK_CARD },
      shadow: cardShadow(),
      line: { color: CARD_BORDER, width: 1 }
    });
    // Top accent
    slide.addShape("rectangle", {
      x: cx, y: 1.9, w: 2.8, h: 0.05,
      fill: { color: "ff4444" }
    });
    // Icon
    slide.addImage({
      data: icons[problems[i].icon],
      x: cx + 1.05, y: 2.2, w: 0.7, h: 0.7
    });
    // Title
    slide.addText(problems[i].title, {
      x: cx + 0.2, y: 3.05, w: 2.4, h: 0.45,
      fontSize: 14, fontFace: TITLE_FONT, color: WHITE,
      align: "center", bold: true, margin: 0
    });
    // Description
    slide.addText(problems[i].desc, {
      x: cx + 0.2, y: 3.5, w: 2.4, h: 1.2,
      fontSize: 11, fontFace: BODY_FONT, color: GRAY,
      align: "center", margin: 0
    });
  }

  addSlideNumber(slide, 3, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 4: The Solution
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("The Solution", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  // Main solution statement
  slide.addText("AgentRep: A Decentralized Trust Layer for AI Agents", {
    x: 0.5, y: 1.2, w: 9, h: 0.5,
    fontSize: 16, fontFace: BODY_FONT, color: LIGHT_PURPLE, bold: true, margin: 0
  });

  // 4 solution pillars
  const solutions = [
    { icon: "shield", title: "ERC-8004 Inspired", desc: "Reputation scoring standard adapted for decentralized AI agent ecosystems" },
    { icon: "comments", title: "HCS-10 Communication", desc: "Native agent-to-agent messaging via Hedera Consensus Service topics" },
    { icon: "coins", title: "HBAR Staking", desc: "Stake HBAR as collateral with slashing for malicious behavior" },
    { icon: "globe", title: "Built on Hedera", desc: "Fast, fair, and carbon-negative DLT with enterprise-grade reliability" }
  ];

  for (let i = 0; i < 4; i++) {
    const cx = 0.5 + i * 2.35;
    slide.addShape("rectangle", {
      x: cx, y: 1.95, w: 2.1, h: 2.9,
      fill: { color: DARK_CARD },
      shadow: cardShadow(),
      line: { color: CARD_BORDER, width: 1 }
    });
    // Top accent
    slide.addShape("rectangle", {
      x: cx, y: 1.95, w: 2.1, h: 0.05,
      fill: { color: PRIMARY }
    });
    // Icon
    slide.addImage({
      data: icons[solutions[i].icon],
      x: cx + 0.7, y: 2.25, w: 0.7, h: 0.7
    });
    // Title
    slide.addText(solutions[i].title, {
      x: cx + 0.15, y: 3.1, w: 1.8, h: 0.55,
      fontSize: 12, fontFace: TITLE_FONT, color: WHITE,
      align: "center", bold: true, margin: 0
    });
    // Desc
    slide.addText(solutions[i].desc, {
      x: cx + 0.15, y: 3.65, w: 1.8, h: 1.0,
      fontSize: 10, fontFace: BODY_FONT, color: GRAY,
      align: "center", margin: 0
    });
  }

  addSlideNumber(slide, 4, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 5: How It Works
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("How It Works", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  // 4 steps flow
  const steps = [
    { num: "1", title: "Register", desc: "Register agent identity on-chain via smart contract" },
    { num: "2", title: "Stake HBAR", desc: "Lock HBAR as collateral to signal commitment" },
    { num: "3", title: "Interact", desc: "Complete tasks, receive feedback and validations" },
    { num: "4", title: "Build Rep", desc: "Earn verifiable reputation score (0-1000)" }
  ];

  for (let i = 0; i < 4; i++) {
    const cx = 0.5 + i * 2.35;
    // Step number circle
    slide.addShape("oval", {
      x: cx + 0.75, y: 1.2, w: 0.6, h: 0.6,
      fill: { color: PRIMARY }
    });
    slide.addText(steps[i].num, {
      x: cx + 0.75, y: 1.2, w: 0.6, h: 0.6,
      fontSize: 18, fontFace: TITLE_FONT, color: WHITE,
      align: "center", valign: "middle", margin: 0
    });

    // Arrow between steps
    if (i < 3) {
      slide.addImage({
        data: icons.arrowWhite,
        x: cx + 1.95, y: 1.3, w: 0.4, h: 0.4
      });
    }

    // Step title
    slide.addText(steps[i].title, {
      x: cx, y: 1.95, w: 2.1, h: 0.35,
      fontSize: 14, fontFace: TITLE_FONT, color: WHITE,
      align: "center", bold: true, margin: 0
    });
    // Step desc
    slide.addText(steps[i].desc, {
      x: cx + 0.1, y: 2.35, w: 1.9, h: 0.7,
      fontSize: 10, fontFace: BODY_FONT, color: GRAY,
      align: "center", margin: 0
    });
  }

  // Reputation components section
  slide.addText("Reputation Score Components", {
    x: 0.5, y: 3.2, w: 9, h: 0.4,
    fontSize: 14, fontFace: TITLE_FONT, color: LIGHT_PURPLE, align: "center", margin: 0
  });

  const repComponents = [
    { name: "Quality", weight: "300", color: "8259ef" },
    { name: "Reliability", weight: "300", color: "6c45d9" },
    { name: "Activity", weight: "200", color: "b47aff" },
    { name: "Consistency", weight: "200", color: "9966ee" }
  ];

  for (let i = 0; i < 4; i++) {
    const cx = 1.0 + i * 2.1;
    slide.addShape("rectangle", {
      x: cx, y: 3.75, w: 1.8, h: 1.3,
      fill: { color: DARK_CARD },
      shadow: cardShadow(),
      line: { color: repComponents[i].color, width: 1.5 }
    });
    slide.addText(repComponents[i].name, {
      x: cx, y: 3.85, w: 1.8, h: 0.4,
      fontSize: 12, fontFace: TITLE_FONT, color: WHITE,
      align: "center", bold: true, margin: 0
    });
    slide.addText(repComponents[i].weight, {
      x: cx, y: 4.25, w: 1.8, h: 0.5,
      fontSize: 28, fontFace: TITLE_FONT, color: repComponents[i].color,
      align: "center", bold: true, margin: 0
    });
    slide.addText("points", {
      x: cx, y: 4.7, w: 1.8, h: 0.25,
      fontSize: 9, fontFace: BODY_FONT, color: GRAY,
      align: "center", margin: 0
    });
  }

  addSlideNumber(slide, 5, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 6: Architecture
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("Architecture", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  // 3-layer architecture
  const layers = [
    {
      title: "Frontend", subtitle: "Next.js",
      icon: "desktop", color: "3b82f6",
      items: ["Agent Explorer", "Registration", "Leaderboard", "Profile Pages", "Connections"]
    },
    {
      title: "Backend", subtitle: "NestJS",
      icon: "server", color: "8259ef",
      items: ["Reputation Engine", "Feedback System", "Validation Service", "Staking Manager", "HCS-10 Handler"]
    },
    {
      title: "Hedera", subtitle: "DLT Layer",
      icon: "database", color: "10b981",
      items: ["HCS Topics", "Smart Contract", "0.0.8264743", "Mirror Node", "HBAR Staking"]
    }
  ];

  for (let i = 0; i < 3; i++) {
    const cx = 0.5 + i * 3.2;
    // Layer card
    slide.addShape("rectangle", {
      x: cx, y: 1.2, w: 2.9, h: 4.0,
      fill: { color: DARK_CARD },
      shadow: cardShadow(),
      line: { color: layers[i].color, width: 1.5 }
    });
    // Top accent
    slide.addShape("rectangle", {
      x: cx, y: 1.2, w: 2.9, h: 0.06,
      fill: { color: layers[i].color }
    });

    // Icon
    slide.addImage({
      data: icons[layers[i].icon],
      x: cx + 1.1, y: 1.45, w: 0.7, h: 0.7
    });

    // Title
    slide.addText(layers[i].title, {
      x: cx + 0.2, y: 2.2, w: 2.5, h: 0.4,
      fontSize: 16, fontFace: TITLE_FONT, color: WHITE,
      align: "center", bold: true, margin: 0
    });
    // Subtitle
    slide.addText(layers[i].subtitle, {
      x: cx + 0.2, y: 2.55, w: 2.5, h: 0.3,
      fontSize: 11, fontFace: BODY_FONT, color: layers[i].color,
      align: "center", margin: 0
    });

    // Items
    const itemTexts = layers[i].items.map((item, idx) => ({
      text: item,
      options: {
        bullet: true,
        breakLine: idx < layers[i].items.length - 1,
        fontSize: 11,
        color: GRAY,
        fontFace: BODY_FONT
      }
    }));
    slide.addText(itemTexts, {
      x: cx + 0.3, y: 3.0, w: 2.4, h: 2.0,
      paraSpaceAfter: 4, margin: 0
    });

    // Arrow between layers
    if (i < 2) {
      slide.addImage({
        data: icons.arrowWhite,
        x: cx + 3.0, y: 2.9, w: 0.3, h: 0.3
      });
    }
  }

  addSlideNumber(slide, 6, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 7: Key Features
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("Key Features", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  const features = [
    { icon: "chart", title: "Reputation Scoring", desc: "Weighted 0-1000 score based on quality, reliability, activity, consistency" },
    { icon: "coins", title: "Staking & Slashing", desc: "Smart contract-based HBAR staking with slashing for malicious behavior" },
    { icon: "comments", title: "HCS-10 Messaging", desc: "Native agent-to-agent communication via Hedera Consensus Service" },
    { icon: "users", title: "Community Reviews", desc: "Wallet-verified feedback from real users, not anonymous ratings" },
    { icon: "balance", title: "Dispute Resolution", desc: "On-chain arbitration mechanism for contested agent interactions" },
    { icon: "code", title: "Developer SDK", desc: "npm: agent-rep-sdk for building autonomous reputation-aware agents" }
  ];

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const cx = 0.5 + col * 3.1;
      const cy = 1.15 + row * 2.15;

      slide.addShape("rectangle", {
        x: cx, y: cy, w: 2.8, h: 1.9,
        fill: { color: DARK_CARD },
        shadow: cardShadow(),
        line: { color: CARD_BORDER, width: 1 }
      });
      // Left accent
      slide.addShape("rectangle", {
        x: cx, y: cy, w: 0.05, h: 1.9,
        fill: { color: PRIMARY }
      });

      // Icon
      slide.addImage({
        data: icons[features[idx].icon],
        x: cx + 0.2, y: cy + 0.2, w: 0.45, h: 0.45
      });
      // Title
      slide.addText(features[idx].title, {
        x: cx + 0.75, y: cy + 0.2, w: 1.85, h: 0.45,
        fontSize: 12, fontFace: TITLE_FONT, color: WHITE,
        bold: true, valign: "middle", margin: 0
      });
      // Desc
      slide.addText(features[idx].desc, {
        x: cx + 0.2, y: cy + 0.85, w: 2.4, h: 0.85,
        fontSize: 10, fontFace: BODY_FONT, color: GRAY, margin: 0
      });
    }
  }

  addSlideNumber(slide, 7, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 8: On-Chain Proof
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("On-Chain Proof", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  slide.addText("All deployed and verifiable on Hedera Testnet", {
    x: 0.5, y: 1.15, w: 9, h: 0.4,
    fontSize: 13, fontFace: BODY_FONT, color: GRAY, margin: 0
  });

  // On-chain items
  const onChainItems = [
    { label: "Smart Contract", value: "0.0.8264743", note: "Source-verified on Sourcify" },
    { label: "Identity Topic", value: "0.0.8264956", note: "Agent registration records" },
    { label: "Feedback Topic", value: "0.0.8264959", note: "User feedback submissions" },
    { label: "Validation Topic", value: "0.0.8264962", note: "Community validations" }
  ];

  for (let i = 0; i < 4; i++) {
    const cy = 1.7 + i * 0.85;
    slide.addShape("rectangle", {
      x: 0.5, y: cy, w: 5.5, h: 0.7,
      fill: { color: DARK_CARD },
      line: { color: CARD_BORDER, width: 1 }
    });
    slide.addImage({
      data: icons.checkWhite,
      x: 0.7, y: cy + 0.15, w: 0.4, h: 0.4
    });
    slide.addText(onChainItems[i].label, {
      x: 1.2, y: cy + 0.05, w: 1.8, h: 0.35,
      fontSize: 12, fontFace: TITLE_FONT, color: WHITE, bold: true, margin: 0
    });
    slide.addText(onChainItems[i].value, {
      x: 3.1, y: cy + 0.05, w: 1.5, h: 0.35,
      fontSize: 12, fontFace: BODY_FONT, color: PRIMARY, margin: 0
    });
    slide.addText(onChainItems[i].note, {
      x: 1.2, y: cy + 0.35, w: 4.5, h: 0.3,
      fontSize: 9, fontFace: BODY_FONT, color: GRAY, margin: 0
    });
  }

  // Tech stack section
  slide.addText("Tech Stack", {
    x: 6.5, y: 1.7, w: 3, h: 0.4,
    fontSize: 14, fontFace: TITLE_FONT, color: LIGHT_PURPLE, margin: 0
  });

  const techStack = ["Hedera", "Next.js", "NestJS", "TypeORM", "PostgreSQL", "Solidity"];
  for (let i = 0; i < techStack.length; i++) {
    const cy = 2.2 + i * 0.48;
    slide.addShape("rectangle", {
      x: 6.5, y: cy, w: 2.8, h: 0.38,
      fill: { color: DARK_CARD },
      line: { color: CARD_BORDER, width: 0.5 }
    });
    slide.addImage({
      data: icons.checkWhite,
      x: 6.6, y: cy + 0.04, w: 0.3, h: 0.3
    });
    slide.addText(techStack[i], {
      x: 7.0, y: cy, w: 2.2, h: 0.38,
      fontSize: 11, fontFace: BODY_FONT, color: WHITE, valign: "middle", margin: 0
    });
  }

  addSlideNumber(slide, 8, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 9: Roadmap & Key Learnings
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("Roadmap & Key Learnings", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  // Key Learnings section (left)
  slide.addShape("rectangle", {
    x: 0.5, y: 1.2, w: 4.2, h: 3.9,
    fill: { color: DARK_CARD },
    shadow: cardShadow(),
    line: { color: CARD_BORDER, width: 1 }
  });
  slide.addImage({
    data: icons.lightbulb,
    x: 0.8, y: 1.35, w: 0.4, h: 0.4
  });
  slide.addText("Key Learnings", {
    x: 1.3, y: 1.35, w: 3, h: 0.4,
    fontSize: 14, fontFace: TITLE_FONT, color: WHITE, bold: true, margin: 0
  });

  const learnings = [
    "HCS-10 is powerful for agent communication, enabling structured message passing between AI agents",
    "ERC-8004 needs adaptation for decentralized contexts where no central authority exists",
    "Reputation algorithms need careful weighting to prevent gaming and ensure fairness"
  ];
  const learningTexts = learnings.map((l, idx) => ({
    text: l,
    options: {
      bullet: true,
      breakLine: idx < learnings.length - 1,
      fontSize: 11,
      color: GRAY,
      fontFace: BODY_FONT
    }
  }));
  slide.addText(learningTexts, {
    x: 0.8, y: 1.9, w: 3.7, h: 3.0,
    paraSpaceAfter: 8, margin: 0
  });

  // Next Steps section (right)
  slide.addShape("rectangle", {
    x: 5.2, y: 1.2, w: 4.3, h: 3.9,
    fill: { color: DARK_CARD },
    shadow: cardShadow(),
    line: { color: CARD_BORDER, width: 1 }
  });
  slide.addImage({
    data: icons.rocket,
    x: 5.5, y: 1.35, w: 0.4, h: 0.4
  });
  slide.addText("Next Steps", {
    x: 6.0, y: 1.35, w: 3, h: 0.4,
    fontSize: 14, fontFace: TITLE_FONT, color: WHITE, bold: true, margin: 0
  });

  const nextSteps = [
    "LLM integration for autonomous agent responses",
    "Cross-chain reputation portability",
    "Reputation NFTs (soulbound tokens)",
    "Mainnet deployment",
    "DAO governance for dispute resolution",
    "Partnership with AI agent frameworks (LangChain, AutoGPT)"
  ];
  const stepTexts = nextSteps.map((s, idx) => ({
    text: s,
    options: {
      bullet: true,
      breakLine: idx < nextSteps.length - 1,
      fontSize: 11,
      color: GRAY,
      fontFace: BODY_FONT
    }
  }));
  slide.addText(stepTexts, {
    x: 5.5, y: 1.9, w: 3.8, h: 3.0,
    paraSpaceAfter: 6, margin: 0
  });

  addSlideNumber(slide, 9, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 10: Live Demo
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  slide.addText("Live Demo", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 28, fontFace: TITLE_FONT, color: WHITE, align: "left", margin: 0
  });
  slide.addShape("rectangle", {
    x: 0.5, y: 0.95, w: 1.5, h: 0.04,
    fill: { color: PRIMARY }
  });

  // Play button area
  slide.addShape("oval", {
    x: 3.8, y: 1.4, w: 2.4, h: 2.4,
    fill: { color: PRIMARY, transparency: 70 },
    line: { color: PRIMARY, width: 2 }
  });
  slide.addShape("oval", {
    x: 4.2, y: 1.8, w: 1.6, h: 1.6,
    fill: { color: PRIMARY }
  });
  slide.addImage({
    data: icons.play,
    x: 4.6, y: 2.15, w: 0.8, h: 0.8
  });

  // Watch the demo text
  slide.addText("Watch the Demo", {
    x: 2, y: 3.9, w: 6, h: 0.5,
    fontSize: 18, fontFace: TITLE_FONT, color: WHITE,
    align: "center", bold: true, margin: 0
  });

  // YouTube link placeholder
  slide.addText("[INSERT YOUTUBE LINK]", {
    x: 2, y: 4.3, w: 6, h: 0.3,
    fontSize: 12, fontFace: BODY_FONT, color: PRIMARY,
    align: "center", margin: 0
  });

  // Live URL
  slide.addText("Live at agentrep.xyz", {
    x: 2, y: 4.6, w: 6, h: 0.3,
    fontSize: 12, fontFace: BODY_FONT, color: GRAY,
    align: "center", margin: 0,
    hyperlink: { url: "https://agentrep.xyz" }
  });

  // Demo highlights (bottom)
  const highlights = [
    "Agent registration with HBAR payment",
    "Real-time reputation scoring",
    "Agent-to-agent messaging via HCS-10",
    "Feedback/validation/dispute flow",
    "SDK-powered autonomous agent listener"
  ];
  // Two columns for highlights
  slide.addShape("rectangle", {
    x: 0.5, y: 1.3, w: 2.8, h: 3.8,
    fill: { color: DARK_CARD },
    shadow: cardShadow(),
    line: { color: CARD_BORDER, width: 1 }
  });
  slide.addText("Demo Highlights", {
    x: 0.7, y: 1.4, w: 2.4, h: 0.4,
    fontSize: 12, fontFace: TITLE_FONT, color: LIGHT_PURPLE, bold: true, margin: 0
  });
  const hlTexts = highlights.map((h, idx) => ({
    text: h,
    options: {
      bullet: true,
      breakLine: idx < highlights.length - 1,
      fontSize: 10,
      color: GRAY,
      fontFace: BODY_FONT
    }
  }));
  slide.addText(hlTexts, {
    x: 0.7, y: 1.85, w: 2.4, h: 3.0,
    paraSpaceAfter: 6, margin: 0
  });

  addSlideNumber(slide, 10, TOTAL_SLIDES);
  addFooterBar(slide);

  // ════════════════════════════════════════════
  // SLIDE 11: Thank You
  // ════════════════════════════════════════════
  slide = pres.addSlide();
  slide.background = { color: BG };

  // Top accent
  slide.addShape("rectangle", {
    x: 0, y: 0, w: 10, h: 0.04,
    fill: { color: PRIMARY }
  });

  // Logo
  slide.addImage({
    path: LOGO_PATH,
    x: 3.75, y: 0.5, w: 2.5, h: 2.5,
    sizing: { type: "contain", w: 2.5, h: 2.5 }
  });

  // AgentRep
  slide.addText("AgentRep", {
    x: 1, y: 2.9, w: 8, h: 0.6,
    fontSize: 24, fontFace: TITLE_FONT, color: WHITE,
    align: "center", bold: true, margin: 0
  });

  // Website
  slide.addText("agentrep.xyz", {
    x: 1, y: 3.45, w: 8, h: 0.4,
    fontSize: 16, fontFace: BODY_FONT, color: PRIMARY,
    align: "center", margin: 0,
    hyperlink: { url: "https://agentrep.xyz" }
  });

  // Built on Hedera
  slide.addText("Built on Hedera", {
    x: 1, y: 3.85, w: 8, h: 0.35,
    fontSize: 13, fontFace: BODY_FONT, color: GRAY,
    align: "center", margin: 0
  });

  // Links
  slide.addShape("rectangle", {
    x: 2.5, y: 4.3, w: 5, h: 0.8,
    fill: { color: DARK_CARD },
    line: { color: CARD_BORDER, width: 1 }
  });

  slide.addImage({
    data: icons.github,
    x: 3.0, y: 4.45, w: 0.35, h: 0.35
  });
  slide.addText("github.com/firasbelhiba/agent-rep", {
    x: 3.4, y: 4.4, w: 3.5, h: 0.35,
    fontSize: 10, fontFace: BODY_FONT, color: GRAY, valign: "middle", margin: 0,
    hyperlink: { url: "https://github.com/firasbelhiba/agent-rep" }
  });

  slide.addText("npm: agent-rep-sdk", {
    x: 3.4, y: 4.75, w: 3.5, h: 0.3,
    fontSize: 10, fontFace: BODY_FONT, color: GRAY, margin: 0
  });

  addFooterBar(slide);

  // ── Write file ──
  await pres.writeFile({ fileName: OUTPUT_PATH });
  console.log("Pitch deck created at:", OUTPUT_PATH);
}

main().catch(err => {
  console.error("Error creating pitch deck:", err);
  process.exit(1);
});
