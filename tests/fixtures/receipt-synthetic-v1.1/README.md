# Homory synthetic-v1.1 oracle subset

This directory contains the deterministic subset of `homory-synthetic-v1.1-rev2.zip` used by the receipt-core test suite.

Included:

- `oracle/literal_source/`: literal generator exports accepted by the server indexer;
- `oracle/semantic/`: the only source of expected classifications and product decisions;
- `generator/`: the source generator with pinned Python dependency versions;
- `manifest.json`: upstream case metadata and output hashes.

Excluded on purpose:

- legacy `gold/`, which must not drive deterministic decisions;
- generated HTML, PNG, and Telegram JPEG files, because this stage performs no vision/OCR evaluation;
- generated reports, which are replaced by the repository report for the current core SHA;
- `generator/__pycache__` and other generated Python artifacts.

Text fragments in the semantic oracle use `textRange` with JavaScript string offsets (`start` inclusive, `end` exclusive). The selected range remains anchored to one existing literal `cellId`; numeric ownership continues to use stable token IDs.

Run the oracle suite with:

```bash
node --test tests/receipt-oracle-synthetic-v1.1.test.mjs
```

The full upstream generator requires the platform fonts and Chromium version documented in `UPSTREAM_README.md`. Run `generator/reproduce.sh` only in an isolated development environment; it is not part of normal application tests.
