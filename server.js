require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Needed on hosts that sit behind a proxy (Render, Railway, etc.) so the
// rate limiter below sees the visitor's real IP.
app.set("trust proxy", 1);

// Every submission is saved here first, so a lead is never lost even if
// email delivery fails. Swap for a real database later.
const SUBMISSIONS_FILE = path.join(__dirname, "data", "submissions.json");

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Chrome DevTools probes this on every page load; answer quietly.
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.status(204).end();
});

// ---------- Email (nodemailer) ----------
function makeTransporter() {
  // MAIL_DEBUG=json prints emails to the console instead of sending them —
  // handy for testing locally without touching Gmail.
  if (process.env.MAIL_DEBUG === "json") {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS }, // SMTP_PASS = Gmail App Password
  });
}

const transporter = makeTransporter();
if (!transporter) {
  console.warn(
    "Email not configured: set SMTP_USER and SMTP_PASS in .env. " +
      "Submissions will still be saved to data/submissions.json."
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendInquiryEmail(entry) {
  const to = process.env.MAIL_TO || process.env.SMTP_USER;
  const info = await transporter.sendMail({
    from: `"Flinnch website" <${process.env.SMTP_USER || "site@flinnch.in"}>`,
    to,
    // Hitting "Reply" in Gmail replies straight to the visitor.
    replyTo: { name: entry.name, address: entry.email },
    subject: `New project inquiry from ${entry.name.replace(/[\r\n]+/g, " ")}`,
    text: `Name: ${entry.name}\nEmail: ${entry.email}\n\n${entry.message}\n`,
    html: `
      <h2 style="margin:0 0 12px">New project inquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(entry.name)}<br>
         <strong>Email:</strong> ${escapeHtml(entry.email)}</p>
      <p style="white-space:pre-wrap">${escapeHtml(entry.message)}</p>
    `,
  });
  if (process.env.MAIL_DEBUG === "json") {
    console.log("MAIL_DEBUG email:", info.message);
  }
}

// ---------- Storage ----------
function readSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, "utf-8"));
  } catch (err) {
    return [];
  }
}

function writeSubmissions(list) {
  fs.mkdirSync(path.dirname(SUBMISSIONS_FILE), { recursive: true });
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(list, null, 2));
}

// ---------- Basic abuse protection ----------
// Simple in-memory limit: 5 submissions per IP per 10 minutes.
const hits = new Map();
function tooManyRequests(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Routes ----------
app.post("/api/contact", async (req, res) => {
  if (tooManyRequests(req.ip)) {
    return res.status(429).json({
      ok: false,
      error: "Too many requests. Please try again in a few minutes.",
    });
  }

  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({
      ok: false,
      error: "name, email and message are all required.",
    });
  }

  const entry = {
    name: String(name).trim().slice(0, 100),
    email: String(email).trim().slice(0, 200),
    message: String(message).trim().slice(0, 5000),
    receivedAt: new Date().toISOString(),
  };

  if (!EMAIL_RE.test(entry.email)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
  }

  // 1) Save first — the lead is safe no matter what happens next.
  const submissions = readSubmissions();
  submissions.push(entry);
  writeSubmissions(submissions);

  // 2) Then email. A mail failure is logged but doesn't fail the request,
  //    since the submission is already saved.
  if (transporter) {
    try {
      await sendInquiryEmail(entry);
    } catch (err) {
      console.error("Email send failed:", err.message);
    }
  }

  res.json({ ok: true });
});

// Local-only view of saved submissions. Disabled in production so visitor
// emails and messages are never publicly readable.
if (!IS_PROD) {
  app.get("/api/contact", (req, res) => {
    res.json(readSubmissions());
  });
}

app.listen(PORT, () => {
  console.log(`Site running at http://localhost:${PORT}`);
});