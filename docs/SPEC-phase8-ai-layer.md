# Spec: Phase 8 — AI Layer (ModelLayer)

## Objective
Cogniflux bisa menjawab pertanyaan riset ("ask") dengan jawaban yang
**dibuktikan oleh evidence** dari paper yang di-index (OpenAlex/Crossref/
Europe PMC). LLM di-backing oleh provider-agnostic abstraction — default
ZRouter (OpenAI-compatible), tapi interface memungkinkan ganti provider lain
(tanpa mengubah kode fitur).

User story:
- Sebagai peneliti/mahasiswa, saya mengetik pertanyaan → Cogniflux retrieval
  paper relevan (orchestrator yang sudah ada), lalu menghasilkan ringkasan
  ter-ground dengan sitasi [1][2] yang link ke halaman paper.
- Tanpa API key / provider down → halaman tetap berfungsi, degrade
  graceful: hanya daftar paper (mode "search-only") + pesan bahwa AI off.

## Assumptions (koreksi bila salah)
1. Backend LLM = ZRouter `api.zrouter.dev/v1` (OpenAI-compat, key sudah ada
   di VPS, pool 2.44M token). Model default: `deepseek-v4.1-flash`.
2. Fitur baru berdiri sendiri (`/ask` + `/api/ask`), TIDAK mengubah
   `/api/search` yang sudah diuji contract-nya.
3. Kunci disimpan di `.env.local` (gitignored) — tidak pernah di-commit.
4. Jawabannya bukan "chat" multi-turn di v1 — single Q→A dengan evidence.
   Multi-turn nanti di Phase 9.

## Tech Stack
Next.js 15 App Router (sudah ada), fetch native (tanpa dependency baru),
PostgreSQL untuk log usage, Redis untuk cache jawaban (opsional, v1: in-proc
cache TTL 10 menit), rate-limit lib yang sudah ada (`src/lib/auth/rate-limit.ts`).

## Architecture
```
POST /api/ask {question, locale}
  → rate-limit (per IP, seperti /api/search)
  → intent: pertanyaan → query retrieval (v1: pakai pertanyaan apa adanya,
    plus trim stopword ID/EN sederhana)
  → orchestrator.search() (existing) → top-N paper (N=6)
  → context builder: title+abstract+year+source per paper, budget ~3k token
  → ModelLayer.complete(messages)   ← interface provider-agnostic
  → parse + validate: jawaban WAJIB menyebut [n] yang ada di list;
    kalau tidak → fallback search-only
  → NextResponse {answer, papers[], cited[], model, degraded?}
```

Interface (mirip pola AcademicProvider yang sudah terbukti):
```ts
// src/lib/models/types.ts
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface CompletionResult { text: string; model: string; usage?: { promptTokens: number; completionTokens: number } }
export interface LLMProvider {
  readonly id: string;
  readonly available: boolean;      // key configured
  readonly timeoutMs: number;
  complete(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<CompletionResult>;
}
```
- `src/lib/models/zrouter.ts` — implementasi OpenAI-compat via fetch.
- `src/lib/models/index.ts` — `getModelLayer()` pilih provider dari env,
  fallback `NullProvider` (available=false → route degrade).

## Commands
- Typecheck: `npm run typecheck`
- Test: `npx jest --runInBand tests/phase8-ai.test.ts`
- Verifikasi penuh sebelum commit: `npm run verify`
- Build prod (HARUS stop service dulu — RAM): `sudo systemctl stop cogniflux && bash scripts/build_prod.sh && sudo systemctl start cogniflux`

## Project Structure
- `src/lib/models/` → types.ts, zrouter.ts, index.ts (baru)
- `src/lib/ask.ts` → orchestration retrieval+grounding (baru)
- `src/app/api/ask/route.ts` → endpoint (baru)
- `src/app/ask/page.tsx` + komponen → UI tanya-jawab (baru)
- `tests/phase8-ai.test.ts` → unit (mock provider, parser validasi sitasi) +
  integration terhadap server jalan (graceful degrade + smoke live kalau key aktif)
- `db/migrations/006_ai_queries.sql` → tabel `ai_queries` (log: question,
  model, tokens, status, duration) — **ASK FIRST sebelum migrate**

## Code Style
Ikuti konvensi repo: named exports, zod untuk validasi input route,
`withLogging`/requestId pada API routes, error envelope `{error: code}`.
Provider timeout keras 25s; jawaban maxTokens 800; temperature 0.2.

## Testing Strategy
- Unit: parser validasi sitasi, context builder (budget truncation),
  NullProvider path — pakai mock LLMProvider, tanpa network.
- Integration: `POST /api/ask` tanpa key → 200 `degraded:true`; input kosong
  → 400; rate limit memantul. Dengan key (live smoke manual, bukan CI):
  jawaban menyebut minimal 1 sitasi valid.
- Gate: `npm run verify` + 99 test lama tetap hijau.

## Boundaries
- **Always**: tests sebelum commit; coercion number dari pg (NUMERIC→string!);
  jangan build sambil service jalan.
- **Ask first**: tambah dependency npm; migrasi DB baru; mengubah
  respons shape endpoint yang sudah ada.
- **Never**: commit API key; kirim pertanyaan user ke provider tanpa
  rate-limit; menampilkan full abstract >500 kata ke LLM (budget).

## Success Criteria
1. `POST /api/ask` dengan pertanyaan valid → jawaban ter-ground + sitasi
   `[n]` yang semua-nya menunjuk paper di list respons (divalidasi kode).
2. Tanpa key → 200 degraded, UI menampilkan hasil retrieval saja.
3. 1 provider baru bisa ditambahkan tanpa menyentuh `src/lib/ask.ts`.
4. Suite ≥ 110 test hijau; `verify:contract` lolos (route baru didaftarkan).
5. Tidak ada peningkatan RAM signifikan di prod (memory.current service
   < 800MB seperti sekarang).

## Risks
| Risk | Impact | Mitigasi |
|---|---|---|
| Token cost / pool habis | MED | cache TTL, maxTokens cap, log usage |
| Hallucination jawaban | HIGH | validasi sitasi wajib + grounding prompt + fallback |
| LLM lambat (25s) flood RAM | MED | timeout keras, tidak hold connection >30s, rate-limit |
| Key bocor ke git | HIGH | hanya .env.local, secret-scan pra-commit |
