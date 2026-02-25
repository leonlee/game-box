# Engineering Contracts (v0.1)

This folder contains implementation-ready contracts for Skywake Chronicle MVP.

## Files

- `sql/schema-v0.1.sql`
  - SQLite DDL for dynamic save/runtime data.
- `json/content-pack-v0.1.schema.json`
  - JSON Schema for static content packs.
- `json/tactics-dsl-v1.schema.json`
  - JSON Schema for tactics DSL payload.
- `json/tactics-config.sample.json`
  - Example tactics config for validator tests.
- `ts/tactics-dsl.ts`
  - Canonical enums, limits, and TypeScript interfaces.
- `ts/tactics-validator.ts`
  - Runtime validator for tactics config.

## Apply schema

```bash
sqlite3 skywake-save.db < docs/skywake-chronicle/contracts/sql/schema-v0.1.sql
```

## Validate tactics config at runtime

```ts
import { validateTacticsConfig } from "./tactics-validator";

const result = validateTacticsConfig(input);
if (!result.ok) {
  console.error(result.errors);
}
```

## Notes

- Static IDs in SQLite (`item_id`, `skill_id`, `quest_id`, etc.) are resolved against the JSON content pack at load time.
- Save migration policy follows the approved decision: compatibility is guaranteed only within the same major app version.

## Quick checks

```bash
# 1) SQL apply check
sqlite3 /tmp/skywake-schema-check.db < docs/skywake-chronicle/contracts/sql/schema-v0.1.sql

# 2) TypeScript check for tactics contracts
node node_modules/.bin/tsc --noEmit --strict --target ES2020 --module ESNext --moduleResolution bundler \
  docs/skywake-chronicle/contracts/ts/tactics-dsl.ts \
  docs/skywake-chronicle/contracts/ts/tactics-validator.ts
```
