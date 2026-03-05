const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const cron = require("node-cron");

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());
app.use(express.json());

const GOOGLE_CHAT_WEBHOOK = "https://chat.googleapis.com/v1/spaces/AAQAb0JP7X4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=E58Tt_Kp7-35qfNCDlbyw4Nll3KMc34MN1-6iRMEBbw";

// Fetch Jira tickets
async function fetchJiraTickets(domain, email, token, projectKey) {
  const jql = `project = "${projectKey}" AND sprint in openSprints() AND statusCategory != Done ORDER BY priority ASC`;
  const url = `https://${domain}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,priority,assignee,issuetype,customfield_10020&maxResults=100`;
  const res = await fetch(url, {
    headers: {
      "Authorization": "Basic " + Buffer.from(`${email}:${token}`).toString("base64"),
      "Accept": "application/json",
    },
  });
  return res.json();
}

// GET /jira - used by the artifact
app.get("/jira", async (req, res) => {
  const { domain, email, token, projectKey } = req.query;
  if (!domain || !email || !token || !projectKey)
    return res.status(400).json({ error: "Missing required params" });
  try {
    const data = await fetchJiraTickets(domain, email, token, projectKey);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /send-report - fetches Jira and sends to Google Chat
app.post("/send-report", async (req, res) => {
  const { domain, email, token, projectKey } = req.body;
  if (!domain || !email || !token || !projectKey)
    return res.status(400).json({ error: "Missing required params" });

  try {
    const data = await fetchJiraTickets(domain, email, token, projectKey);
    const issues = data.issues || [];

    // Get sprint name
    let sprintName = "Active Sprint";
    for (const issue of issues) {
      const sf = issue.fields?.customfield_10020;
      if (Array.isArray(sf)) {
        const active = sf.find(s => s.state === "active");
        if (active) { sprintName = active.name; break; }
      }
    }

    const priorityIcon = { Highest: "🔴", High: "🟠", Medium: "🟡", Low: "🟢", Lowest: "🔵" };
    const typeIcon = { Bug: "🐛", Task: "✅", Story: "📖", Epic: "⚡", "Sub-Bug": "🐞" };

    // Build Google Chat message
    let message = `*📋 Jira Sprint Report — ${sprintName}*\n`;
    message += `*Project:* ${projectKey.toUpperCase()}  |  *Open Tickets:* ${issues.length}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Group by priority
    const groups = { High: [], Medium: [], Low: [], Highest: [], Lowest: [] };
    for (const issue of issues) {
      const p = issue.fields.priority?.name || "Medium";
      if (!groups[p]) groups[p] = [];
      groups[p].push(issue);
    }

    for (const priority of ["Highest", "High", "Medium", "Low", "Lowest"]) {
      const group = groups[priority];
      if (!group || group.length === 0) continue;
      message += `${priorityIcon[priority]} *${priority} Priority*\n`;
      for (const issue of group) {
        const key = issue.key;
        const summary = issue.fields.summary;
        const assignee = issue.fields.assignee?.displayName || "Unassigned";
        const status = issue.fields.status?.name || "Unknown";
        const type = issue.fields.issuetype?.name || "Task";
        message += `  ${typeIcon[type] || "📌"} *${key}* — ${summary}\n`;
        message += `      👤 ${assignee}  |  📌 ${status}\n`;
      }
      message += `\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `_Report generated on ${new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })} (AST)_`;

    // Send to Google Chat
    const chatRes = await fetch(GOOGLE_CHAT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!chatRes.ok) {
      const err = await chatRes.text();
      return res.status(500).json({ error: `Google Chat error: ${err}` });
    }

    res.json({ success: true, message: `Report sent to Google Chat with ${issues.length} tickets!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Jira proxy running at http://localhost:${PORT}`));

// Cron job — Every Sun, Mon, Tue, Wed, Thu at 10:00 AM Bangladesh time (UTC+6 = 04:00 UTC)
cron.schedule("0 4 * * 0,1,2,3,4", async () => {
  console.log("⏰ Running scheduled Jira report...");
  try {
    const data = await fetchJiraTickets(
      "shopup.atlassian.net",
      "nahian@shopup.org",
      process.env.JIRA_TOKEN,
      "SARY"
    );
    const issues = data.issues || [];

    let sprintName = "Active Sprint";
    for (const issue of issues) {
      const sf = issue.fields?.customfield_10020;
      if (Array.isArray(sf)) {
        const active = sf.find(s => s.state === "active");
        if (active) { sprintName = active.name; break; }
      }
    }

    const priorityIcon = { Highest: "🔴", High: "🟠", Medium: "🟡", Low: "🟢", Lowest: "🔵" };
    const typeIcon = { Bug: "🐛", Task: "✅", Story: "📖", Epic: "⚡", "Sub-Bug": "🐞" };

    let message = `*📋 Jira Sprint Report — ${sprintName}*\n`;
    message += `*Project:* SARY  |  *Open Tickets:* ${issues.length}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const groups = { Highest: [], High: [], Medium: [], Low: [], Lowest: [] };
    for (const issue of issues) {
      const p = issue.fields.priority?.name || "Medium";
      if (!groups[p]) groups[p] = [];
      groups[p].push(issue);
    }

    for (const priority of ["Highest", "High", "Medium", "Low", "Lowest"]) {
      const group = groups[priority];
      if (!group || group.length === 0) continue;
      message += `${priorityIcon[priority]} *${priority} Priority*\n`;
      for (const issue of group) {
        const key = issue.key;
        const summary = issue.fields.summary;
        const assignee = issue.fields.assignee?.displayName || "Unassigned";
        const status = issue.fields.status?.name || "Unknown";
        const type = issue.fields.issuetype?.name || "Task";
        message += `  ${typeIcon[type] || "📌"} *${key}* — ${summary}\n`;
        message += `      👤 ${assignee}  |  📌 ${status}\n`;
      }
      message += `\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `_Report generated on ${new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })} (BST)_`;

    const chatRes = await fetch(GOOGLE_CHAT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (chatRes.ok) console.log("✅ Report sent to Google Chat!");
    else console.error("❌ Failed to send report:", await chatRes.text());
  } catch (err) {
    console.error("❌ Scheduled report error:", err.message);
  }
}, { timezone: "UTC" });