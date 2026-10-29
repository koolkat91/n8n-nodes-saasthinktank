# n8n-nodes-saasthinktank

Use SaaS Think Tank’s published software research in n8n workflows.

SaaS Think Tank publishes software comparisons, reviews and practical resources
across categories. This connector’s current edition covers **16 published
findings** about **Base44, Bubble, Lovable and Replit**: code export, GitHub sync,
backend connections and built-in databases. It does not cover the whole research
library, current pricing or overall product rankings.

No SaaS Think Tank account, API key or paid AI model is required.

[Read the app-builder guide](https://saasthinktank.com/ct/no-code-ai-app-builders/)
· [n8n community-node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)

## Installation

Package name: `n8n-nodes-saasthinktank`.

In a self-hosted n8n instance that allows community packages, install the package
through **Settings → Community nodes**. An instance owner or administrator must
install it. After installation, search the node panel for **SaaS Think Tank**.

**n8n verification:** this community connector is not yet verified by n8n.
Unverified community packages are available on self-hosted n8n instances that
allow them. Availability on n8n Cloud depends on n8n verification.

## Operations

| Operation | What it returns |
| --- | --- |
| Search Findings | Matching published findings, with optional product filters and a limit of 1–16 |
| Get Finding | One exact published record using a Record ID from another result |
| Compare Products | Findings for two to four covered products, on selected questions or all four |

Every result includes the public edition’s coverage, original release date,
citation and reuse notice. Findings retain their check dates, conditions,
limits, context and source links. Unknown answers remain unknown.

## Example workflow

Import `examples/public-research.json` into n8n after installing the connector.
Run the manual trigger:

1. Search for “Can Bubble and Lovable export source code?”
2. Retrieve a record returned by that search.
3. Compare all four products on the four covered questions.

The result is structured research for a software shortlist. It does not pick an
overall winner or generate new product claims. Only public product questions
are used. The workflow has no credential, schedule or publishing step.

To connect a Get Finding step after a search, set **Record ID** to:

```text
{{ $json.findings[0].record_id }}
```

Check that a search returned at least one finding before using that expression
in a workflow with changing questions. A question outside coverage can return
an empty findings list with an explanation.

## How the connection works

The node uses n8n’s built-in HTTP helper to call the existing public MCP service
at `https://saasthinktank.com/mcp`. This address cannot be changed through node
parameters. It initializes the public connection, then calls one of the three
read-only research tools. There is no embedded research database, model call,
tracking service or external runtime dependency.

The node sends only the selected operation’s parameters. It does not send the
incoming workflow item wholesale. It does not read environment variables,
local files, private research, website accounts or stored credentials. Redirects
are not followed. No answer cache carries findings across executions.

## Errors and limits

- Unsupported products, duplicate selections and invalid Record IDs give clear
  instructions. A missing record is not evidence about a product capability.
- Questions outside coverage return no matching findings; they do not establish
  that a product lacks the requested feature.
- A busy service returns a rate-limit message. Wait at least 60 seconds before
  trying again. The connector does not retry automatically.
- Timeout defaults to 60 seconds per request and can be set in **Options**.
- If the service cannot verify its public release, it returns no findings.
- Original check dates are not refreshed by running this node. Code export does
  not establish that a whole app, database or login system can move elsewhere.

The public service’s earlier built-in MCP Client test took about 12–17 seconds
per operation, including setup. This is a prior observation, not a promise
about every run or load level.

## Compatibility

The connector follows n8n’s community-node package format and can be selected as
an AI agent tool through n8n’s standard “usable as tool” support. An AI agent
requires its own model setup. Agent answer quality is not established by the
manual research workflow.

Tested locally with self-hosted n8n Community **2.45.5**. All three actions,
filtered comparisons, outside-coverage questions and missing/unsupported
records were exercised against the live public service. Cloud availability
depends on n8n verification; it is not claimed here.

## Development

Use Node.js 24 for the development tools and local n8n test runtime.

```sh
npm ci
npm run build
npm run lint
npm test
```

The connector code is MIT licensed. That license does not relicense the
research returned by the service or linked vendor material. Keep the returned
dataset citation and follow its `license_url`; vendor sources retain their own
rights.

## Support

For connection or coverage issues, include the connector version, n8n version,
operation and a public product question. Do not share credentials, client data
or private workflow contents. Check the public service status at
`https://saasthinktank.com/mcp/health`.
