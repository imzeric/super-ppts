# Tech workbench UI

**Goal:** Replace the magazine paper skin with one technical workbench across every existing screen.

**Architecture:** Shared tokens in `globals.css` and the shell in `Frame.tsx`. No new routes, dependencies, or job behavior.

**Tech Stack:** Existing Next.js app, Noto Sans SC already installed.

## Global Constraints

- Do not change generation, export, or Python job semantics.
- Slide canvas and template swatches keep their own colors.
- No neon floods, purple gradients, or glass cards.
- Chinese UI copy stays, except the paper metaphor on the landing field.

### Task 1

- [x] Restyle shell, forms, editor, batch, settings, and diagram tool from the same tokens.
- [x] Run the local Impeccable detector once after the CSS change.
- [x] Capture fresh demo screenshots and open a new PR. Do not merge.
