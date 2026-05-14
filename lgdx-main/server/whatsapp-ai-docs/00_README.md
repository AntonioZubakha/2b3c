# WhatsApp marketing bot — prompt docs

For the WhatsApp marketing bot, the loader first uses **`LGDEAL_AI_Knowledge_Base_EN.md`** (filtered: excludes internal Part E/F and deploy-only blocks). If that file is missing or empty, it falls back to short fragments **`01`–`04`** in order. Edit the markdown files in this folder; deployment packages this directory into the API/worker image.

**Override path:** env var `WHATSAPP_AI_DOCS_PATH` (absolute path to directory).

**Override entire folder:** `WHATSAPP_SYSTEM_PROMPT_FILE` (single file) or `WHATSAPP_SYSTEM_PROMPT` (env string).

Structure:

| File | Content |
|------|------------|
| `LGDEAL_AI_Knowledge_Base_EN.md` | Full contract (primary for WhatsApp; prompt excludes Part E/F). |
| `01_*.md` | Bot role and goals (fallback if KB is missing). |
| `02_*.md` | Tone and format (fallback). |
| `03_*.md` | Links and CTAs (fallback). |
| `04_*.md` | Safe behavior (fallback). |
