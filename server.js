const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors()); // Allow requests from Claude artifacts
app.use(express.json());

app.get("/jira", async (req, res) => {
  const { domain, email, token, projectKey } = req.query;

  if (!domain || !email || !token || !projectKey) {
    return res.status(400).json({ error: "Missing required query params: domain, email, token, projectKey" });
  }

  const jql = `project = "${projectKey}" AND sprint in openSprints() AND statusCategory != Done ORDER BY priority ASC`;
  const url = `https://${domain}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,priority,assignee,issuetype,customfield_10020&maxResults=100`;

  try {
    const jiraRes = await fetch(url, {
      headers: {
        "Authorization": "Basic " + Buffer.from(`${email}:${token}`).toString("base64"),
        "Accept": "application/json",
      },
    });

    const data = await jiraRes.json();
    res.status(jiraRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`✅ Jira proxy running at http://localhost:${PORT}`));