# n8n-nodes-workiom

n8n community node for the [Workiom](https://workiom.com) no-code platform. It lets you read and write Workiom data (apps, lists, records) and trigger workflows when records are created or updated.

## Nodes

- **Workiom** (action) — App, List, and Record resources with full CRUD. Record Create/Update render a typed field form (date pickers, toggles, and dropdowns for Select/Status/User/Linked-List fields) loaded live from your list schema.
- **Workiom Trigger** — webhook node that fires on **New Record** / **Updated Record**, driven by a Workiom Automation.

## Authentication

Create a **Workiom API** credential:

- **Access Token** — your Workiom API key (sent as the `X-Api-Key` header).
- **Base URL** — defaults to `https://api.workiom.com`; override only for staging/self-hosted.

---

## Build

```bash
# from the project root
npm install
npm run build
```

This compiles TypeScript into `dist/`, which is what n8n loads. Re-run `npm run build` after any source change.

For active development with hot reload:

```bash
npm run dev
```

---

## Use as a custom node (without publishing to npm)

n8n loads any package found under the directory named in `N8N_CUSTOM_EXTENSIONS`. This is the simplest way to run the node locally or on your own n8n instance — no npm publish or Community-Nodes install required.

### Option A — Docker Compose (recommended for local)

A ready-to-use `docker-compose.yml` is included. It mounts this built package into n8n as a custom extension:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_CUSTOM_EXTENSIONS=/custom-extensions
      - GENERIC_TIMEZONE=Asia/Dubai
    volumes:
      - n8n_data:/home/node/.n8n
      # Mount the built package so n8n picks it up as a custom extension
      - .:/custom-extensions/n8n-nodes-workiom:ro

volumes:
  n8n_data:
```

Steps:

```bash
npm run build          # produce dist/
docker compose up -d   # start n8n with the node mounted
```

Open <http://localhost:5678>, then search for **Workiom** when adding a node.

After changing the code:

```bash
npm run build
docker compose restart
```

> The mount maps the **whole package** (including `dist/`, `package.json`, and the `n8n` block) to `/custom-extensions/n8n-nodes-workiom`. n8n reads the `n8n.nodes` / `n8n.credentials` entries in `package.json` to find the compiled files.

### Option B — existing n8n install (npm / self-hosted)

On the machine running n8n, place the built package under the custom-extensions folder and point n8n at it:

```bash
# build the package
npm run build

# copy (or symlink) the whole package somewhere n8n can read
mkdir -p ~/.n8n/custom
cp -r . ~/.n8n/custom/n8n-nodes-workiom

# tell n8n where to look, then start it
export N8N_CUSTOM_EXTENSIONS=~/.n8n/custom
n8n start
```

`~/.n8n/custom` is also scanned by default in many setups, but setting `N8N_CUSTOM_EXTENSIONS` explicitly is the reliable approach. Restart n8n after each rebuild.

---

## Setting up the Trigger

1. Add the **Workiom Trigger** node, pick the event (New / Updated Record), select the App and List, and activate the workflow to get the webhook URL.
2. In Workiom, open the list → **Automations** → create an automation:
   - **Trigger:** Record Created / Record Updated (matching the node)
   - **Action:** Webhook → paste the n8n URL, method `POST`, type `JSON`
   - **Body:** `{"record": "{{1. YourListName}}"}`
3. Save and activate. New/updated records now fire the workflow.

---

## Publishing to npm

See [PUBLISHING.md](PUBLISHING.md) for publishing the package so it can be installed through n8n's in-app Community Nodes feature.

## License

[MIT](LICENSE.md)
