# Changelog

## [0.5.1] - 2026-07-06

### Fixed

- HTTP errors from the Workiom API in record operations now surface as `NodeApiError`, preserving the status code and API error body in n8n's error UI (previously wrapped as a generic `NodeOperationError`). Matches the pattern already used by the webhook trigger.

## [0.5.0] - 2026-07-03

### Fixed

- **Create Record**, **Update Record**, and **Get Many** (field projection and filter field) — field/option dropdowns now refresh immediately when the List selection changes, instead of requiring the node to be closed and reopened.

### Changed

- **Create Record** — field mapper now starts with only required fields shown; optional fields are added via "Add field" (matches Update Record behavior).

## [0.4.1] - 2026-06-29

### Fixed

- **Update Record** — field mapper now starts empty; add only the fields you want to patch instead of all fields being pre-populated.
- **Update Record** — fields load as soon as the list is selected (consistent with Create Record behavior).

## [0.4.0] - 2025-06-17

### Changed

- Removed List "Get Many" operation.
- Added field projection (`projectedFields`) to Record "Get Many" — return only the fields you need.

## [0.3.0] - 2025-06-10

### Added

- Enriched App and List `get` output (human-readable type names, stripped internal noise).
- Added `In` / `Not In` filter operators to Record "Get Many".
- Webhook trigger maps field IDs to field names in the output payload.
- Record operations map numeric field IDs to field names in all responses.
