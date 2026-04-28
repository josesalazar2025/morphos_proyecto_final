# Morphos — Veterinary Hematology & Biochemistry Interpreter

> Open-source static web app for pattern-based interpretation of hematological and biochemical profiles in veterinary medicine. Spanish-language-first. No backend registration required for core features.

---

## Project Overview

**Morphos** is a clinical decision-support tool for veterinary professionals. It analyzes CBC (complete blood count) and biochemistry panels, detects clinically significant patterns, and generates differential diagnoses using species-specific reference ranges.

The project is structured in two layers:
- **Core (static, always free):** Pattern detection, differential generation, reference range comparison — all client-side, no auth required.
- **AI layer (user-configured):** MedGemma inference via Hugging Face ZeroGPU, enabled by the user's own HF API key. No key is bundled or stored server-side.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS (no framework) |
| Backend | PHP (REST-style endpoints, no Python) |
| AI Inference | MedGemma via Hugging Face Inference API (ZeroGPU) |
| Hosting | GitHub Pages (static core) + PHP host for AI proxy |
| Reference Data | External JSON (`reference_ranges.json`) |
| Auth | None for core; user-supplied HF API key for AI features |

> **No Python. No Django. No Flask. No FastAPI.** All server-side logic is PHP.

---

## Architecture

```
morphos/
├── index.html                  # Main entry point
├── css/
│   └── styles.css
├── js/
│   ├── app.js                  # Main controller
│   ├── patterns.js             # Pattern detection engine
│   ├── differentials.js        # Differential diagnosis logic
│   ├── clinical_signs.js       # Clinical signs input & payload builder
│   └── ui.js                   # DOM / rendering
├── data/
│   └── reference_ranges.json   # Species-specific reference ranges
├── php/
│   ├── inference.php           # HF API proxy (forwards user HF key)
│   └── config.php              # PHP config (no secrets stored here)
└── README.md
```

### Data Flow

```
User input (CBC/biochem values)  +  Clinical signs (free text, optional)
        ↓
[JS] reference_ranges.json comparison
        ↓
[JS] patterns.js — flag abnormalities, classify patterns
        ↓
[JS] differentials.js — rule-based differential list
        ↓
[JS] clinical_signs.js — sanitizes signs text, merges into AI payload
        ↓ (optional, if user has HF key configured)
[PHP] inference.php — builds structured prompt (values + patterns + signs) → HF ZeroGPU
        ↓
MedGemma response → rendered interpretation
```

---

## Core Features

### Pattern Detection (client-side, always available)
- Detects: regenerative vs. non-regenerative anemia, leukocytosis/leukopenia, thrombocytopenia, neutrophilia with left shift, lymphopenia, eosinophilia, monocytosis
- Biochemistry: azotemia (pre/renal/post), hepatopathy patterns, electrolyte disturbances, hypoglycemia/hyperglycemia
- Rule-based engine, deterministic, no AI required

### Differential Diagnosis Generation
- Ranked differential list per detected pattern
- Species-specific (canine / feline / equine — extendable via JSON)
- Includes clinical priority flags (urgent / monitor / incidental)

### Reference Ranges (JSON-driven)
- All ranges in `data/reference_ranges.json`
- Easily editable without touching JS logic
- Structured by species → parameter → `{min, max, unit, notes}`

### MedGemma AI Interpretation (optional)
- User configures their own Hugging Face API key in settings
- Key is sent per-request to `php/inference.php`, never persisted server-side
- `inference.php` forwards the request to `https://api-inference.huggingface.co/models/google/medgemma-*` with ZeroGPU
- Prompt sent to the model includes three context blocks: **lab values + detected patterns + clinical signs**
- Response is a free-text clinical commentary to complement the rule-based output
- Feature degrades gracefully if no key is configured

### Clinical Signs Input
- Optional free-text field in the UI where the clinician describes the patient's presenting signs (e.g., "vómitos de 3 días, polidipsia, pérdida de peso, mucosas pálidas")
- Handled by `js/clinical_signs.js`: sanitizes input (strips HTML, limits to 1000 chars), then packages it into the AI payload
- `inference.php` inserts the signs as a dedicated section in the MedGemma prompt, clearly labelled and separated from lab data
- If left empty, the signs section is omitted from the prompt — no placeholder text is sent to the model
- Clinical signs are **never** used by the rule-based engine; they are exclusively AI context

---

## HF API Key Configuration (User Flow)

1. User opens Settings panel in the app
2. Pastes their Hugging Face API key (read-only token with inference scope)
3. Key is stored in `localStorage` (client-side only)
4. Each AI request sends the key via `Authorization: Bearer <key>` through the PHP proxy
5. The PHP proxy **does not log or store** the key

> The PHP proxy exists to avoid CORS issues with the HF API and to allow potential rate-limiting or caching in the future — not to centralize auth.

---

## PHP Backend (`php/`)

### `inference.php`
- Accepts POST: `{ hf_key, species, values, patterns, clinical_signs }`
- `clinical_signs` is optional; if present and non-empty, included as a dedicated block in the MedGemma prompt
- Prompt structure sent to MedGemma:
  ```
  Especie: {species}
  Signos clínicos: {clinical_signs}        ← omitted if empty
  Valores de laboratorio: {structured values}
  Patrones detectados: {patterns}
  Proporciona una interpretación clínica integrada.
  ```
- Validates input, strips dangerous characters; `clinical_signs` max 1000 chars enforced server-side
- Builds full prompt server-side — client only sends raw data, never prompt strings
- Forwards to HF Inference API
- Returns raw model response as JSON
- **No database. No sessions. No user storage.**

### `config.php`
- App-level constants (model ID, max tokens, allowed species list)
- No secrets. HF key never touches this file.

---

## Open Source

- **License:** MIT
- Contributions welcome: additional species ranges, new pattern rules, translations
- Pattern logic and reference data are intentionally separated so clinicians can contribute without touching JS

---

## Target Users

- Veterinary clinicians (primary, Spanish-speaking market)
- Veterinary students and residents
- Diagnostic laboratory staff
- Clinic owners evaluating clinical decision support tools

---

## Non-Goals (MVP)

- ❌ No OCR / image input for blood smear analysis (post-MVP)
- ❌ No database persistence of patient data
- ❌ No bundled or default AI key
- ❌ No Python anywhere in the stack

---

## Roadmap Notes

- **v1 (MVP):** Static core + PHP AI proxy + HF key flow
- **v2:** Blood smear image upload → Raspberry Pi + local Gemma 4 inference (offline clinic mode)
- **v3:** Opt-in anonymized image dataset collection for model fine-tuning

---

## Development Notes for Claude Code

- All pattern logic lives in `js/patterns.js` — this is the core engine, treat changes carefully
- Reference ranges are **data, not code** — prefer editing `data/reference_ranges.json` over hardcoding values in JS
- `js/clinical_signs.js` is the only JS module that touches the clinical signs field; sanitization and char-limit enforcement happen here before the payload is built — do not add signs handling in `app.js`
- Prompt construction is **exclusively server-side** in `php/inference.php` — the client never sends a pre-built prompt string, only structured data fields
- The PHP layer is intentionally thin — resist adding logic there beyond proxying, prompt building, and input validation
- No build step, no bundler, no npm — this is intentional for portability and GitHub Pages compatibility
- Species support is added by extending `reference_ranges.json` and updating the species selector in `index.html`
- MedGemma model ID may need updating in `php/config.php` as HF releases new versions
- `inference.php` should always validate that `hf_key` matches pattern `^hf_[A-Za-z0-9]+$` before forwarding
- `clinical_signs` field must be sanitized both in `clinical_signs.js` (client) and `inference.php` (server) — never trust client-side sanitization alone
