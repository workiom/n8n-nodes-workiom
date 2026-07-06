# n8n-nodes-workiom

This is an n8n community node. It lets you use **Workiom** in your n8n workflows.

[Workiom](https://workiom.com) is a no-code platform for building data-driven business applications — lists, forms, automations, and dashboards — without writing code.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)  

---

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In short: **Settings → Community Nodes → Install** → search for `@workiom/n8n-nodes-workiom`.

---

## Operations

### Workiom (action node)

| Resource | Operations |
|---|---|
| **App** | Get, Get Many |
| **List** | Get |
| **Record** | Create, Get, Get Many, Update, Delete |

**Record: Get Many** supports pagination (limit / skip), field projection (return only the fields you need), full-text quick search, and field-level filters with 13 operators (Is, Contains, Greater Than, In, Is Empty, …).

**Record: Create / Update** render a live typed field form — date pickers, toggles, and dropdowns for Select, Status, User, and Linked-List fields — loaded directly from your list schema. Update starts with an empty form; add only the fields you want to patch.

### Workiom Trigger (webhook node)

Fires when a record is **created** or **updated** in a Workiom list. Activating the workflow automatically registers the subscription with Workiom — no manual Automation setup required.

---

## Credentials

Create a **Workiom API** credential in n8n:

| Field | Description |
|---|---|
| **Access Token** | Your Workiom API key — find it in Workiom under **Profile → API Keys**. Sent as the `X-Api-Key` header. |
| **Base URL** | Leave as `https://api.workiom.com` unless you are on a self-hosted or staging instance. |

---

## Compatibility

Tested against **n8n 1.x** (1.30 and later). Requires `n8nNodesApiVersion: 1`.

No known incompatibilities with earlier 1.x releases. Not tested against n8n 0.x.

---

## Usage

### Setting up the Workiom Trigger

1. Add the **Workiom Trigger** node to your workflow, choose **New Record** or **Updated Record**, and select the App and List.
2. Activate the workflow. n8n registers the subscription with Workiom automatically — no need to build a matching Automation by hand.
3. Records now fire the workflow automatically. Deactivating the workflow removes the subscription again.

### Updating only specific fields

The **Update Record** operation starts with an empty field form. Click **Add field** to select each field you want to change. Fields you leave out are not sent to the API — Workiom only overwrites what you include.

### Field types and values

| Field type | What to pass |
|---|---|
| Text, Email, Website, Phone | Plain string |
| Number, Currency, Count, Progress | Numeric value |
| DateTime | ISO 8601 string, e.g. `2024-06-01T09:00:00` |
| Boolean | `true` / `false` |
| Select, Status, Multi-Select | Option name or option ID — the node renders a dropdown |
| User, Multi-User | Select from the dropdown (user ID is sent automatically) |
| Linked List | Select from the dropdown (record ID is sent automatically) |

---

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Workiom documentation](https://help.workiom.com)
- [Workiom API reference](https://api.workiom.com/swagger)

---

## Version history

### 0.5.1
- HTTP errors from the Workiom API now show the actual status code and error body in n8n, instead of a generic error.

### 0.5.0
- Create Record, Update Record, and Get Many field/filter dropdowns now refresh immediately when you change the List, instead of requiring the node to be closed and reopened.
- Create Record starts with only required fields shown; add optional fields via "Add field" (matches Update Record).

### 0.4.1
- Update Record field form starts empty — add only the fields you want to patch.
- Fields load as soon as the list is selected.
- Removed build artefacts from the published package.

### 0.4.0
- Added field projection to Record "Get Many" — return only the fields you need.
- Removed List "Get Many" (replaced by App "Get" which includes all lists).

### 0.3.0
- Human-readable field names in all record responses (field IDs are mapped to names).
- Enriched App and List `get` output.
- Added `In` / `Not In` filter operators.
- Webhook trigger maps field IDs to names in the output payload.
