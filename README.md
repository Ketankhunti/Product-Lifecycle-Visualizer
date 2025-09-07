# Product Lifecycle Visualizer

Turn any plain‑language product description into an interactive, AI‑generated sustainability lifecycle storyboard (Raw Materials → Manufacturing → Distribution → Usage → End‑of‑Life / Recycling). Each stage includes: 
- Rich multi‑paragraph description (environmental focus + improvement levers)
- Auto‑generated illustrative image
- Modal with navigation, zoom, share, and image download

Front‑end: Next.js + React Three Fiber (3D scene + HTML overlays)
Back‑end: Rust (Axum) + Gemini API (text + image)

---
> Browser Recommendation: For the most accurate card alignment and visual effects, use Google Chrome. Microsoft Edge may currently show slight horizontal misalignment of lifecycle cards; a cross‑browser layout refinement is planned.
>
---
> This project is created in private repositiory. And for demo purpose only pushed into public repo. That's why you may see single final commit message.

---
## 1. Quick Start (Both Services)
### Prerequisites
- Rust 1.75+ (stable)  
- Node.js 18+ (and npm)  
- (Optional) Google Gemini API key

### Clone & Install
```bash
# Backend dependencies (Rust)
cargo build

# Frontend
cd frontend
npm install
```

### Environment
Create a `.env` file at repo root:
```
GEMINI_API_KEY=DEMO_KEY
GEMINI_API_BASE=https://generativelanguage.googleapis.com/v1beta
PORT=8080
```
Replace `DEMO_KEY` with a real key to enable live image & rich text generation.

### Run (Two Terminals)
```bash
# Terminal 1 – backend (repo root)
cargo run

# Terminal 2 – frontend
cd frontend
npm run dev
```
Open: http://localhost:3000

Backend API: http://localhost:8080

---
## 2. How It Works
1. User enters a product description.
2. Backend creates an empty lifecycle skeleton (`POST /api/lifecycle/create`).
3. For each of 5 canonical stages, backend concurrently:
   - Builds a stage image prompt (vector‑style, clean background)
   - Requests Gemini for: image + 3‑paragraph sustainability description
4. Frontend polls sequentially and updates cards in place (animated 3D layout).
5. Clicking a card opens an advanced modal (zoom, prev/next navigation, share, download).

### Stage Order
`Raw Materials, Manufacturing, Distribution, Usage, End-of-Life / Recycling`

---
## 3. Backend Details (Rust / Axum)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/lifecycle/create` | POST | Create lifecycle skeleton (empty stages) |
| `/api/lifecycle/{id}/stage/{stage_index}` | POST | Generate a specific stage (image + description) |
| `/api/lifecycle/{id}` | GET | Fetch full lifecycle JSON |
| `/api/lifecycle/{id}/stage` | POST | (Re)generate a stage via body payload (legacy) |

### Regeneration Flow
To regenerate a stage: call stage endpoint again; it overwrites the prior image & description.

### Gemini Fallbacks
If `GEMINI_API_KEY` is `DEMO_KEY` or API fails:
- A colored SVG placeholder is generated per stage.
- Descriptions use structured multi‑paragraph fallback text.

---
## 4. Frontend Details (Next.js)
Key file: `frontend/app/page.tsx`
Features:
- Responsive 3D card positioning + viewport clamping
- Overlap avoidance logic (DOM post‑layout nudge)
- Rich gradient UI components + animated primary CTAs
- Modal: keyboard (Esc close, arrows nav, Enter zoom), share (Web Share API / clipboard), download image

Tech:
- React Three Fiber & Three.js for background scene
- Framer Motion for entrance + modal animations
- Tailwind (custom utilities + gradient styles)

---
## 5. Data Model (Simplified)
```jsonc
Lifecycle {
  id: string,
  product_description: string,
  stages: Stage[] (length 5),
  constraints: string[],
  created_at: ISO8601,
  updated_at: ISO8601
}
Stage {
  stage_name: string,
  prompt: string,
  description: string,
  image_base64: string | null,
  last_updated: ISO8601
}
```

## 6. Environment Variables
| Variable | Default | Notes |
|----------|---------|-------|
| `GEMINI_API_KEY` | `DEMO_KEY` | Real key enables live generation |
| `GEMINI_API_BASE` | `https://generativelanguage.googleapis.com/v1beta` | Override for proxy/testing |
| `PORT` | `8080` | Backend port |

## 7. Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Cards overlap | Browser resize race | Refresh / ensure layout loop not throttled |
| All images look like colored SVG | Using `DEMO_KEY` | Add real Gemini key |
| CORS errors in browser | Different host setup | Adjust `CorsLayer` (currently allows Any) |

Log level can be tuned via `RUST_LOG` (e.g. `RUST_LOG=debug cargo run`).

## 8. Production Hardening Ideas
- Persist lifecycle data (currently in‑memory) using Postgres
- Add rate limiting / API auth token
- Cache generated assets (S3 / CDN) & store prompt lineage
- Add stage edit instructions & diff display
- Add accessibility improvements (focus trapping already partly covered)
- Image optimization & progressive placeholders

## 9. License
MIT © 2025 Hackathon Team

## 10. Attributions / Disclaimer
Gemini outputs may contain inaccuracies; always review before formal ESG reporting.

## 11. Quick Demo Script
1. Enter: "A bamboo toothbrush with compostable bristles and recycled packaging".
2. Watch stages appear sequentially (images + descriptive text).
3. Click a card → open modal → use arrow keys to navigate.
4. Zoom image (click). Press Esc to close zoom, Esc again to close modal.
Enjoy exploring sustainable product storytelling.

