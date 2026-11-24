---
name: component
description: Builds, extracts or changes a reusable UI component in src/components/ with every state. Use whenever a task needs a control or element the app doesn't have yet (a select, checkbox, text link, disclosure, badge or dialog), changes how a component in src/components/ looks or behaves, repeats markup that already exists, would give a raw button, input, link or summary element its own classes outside src/components/, or asks to add a shadcn component, even if nobody says "component".
---

# Component

Every reusable element is a component in `src/components/`: shadcn's version of it, fitted to a native element and this repo's Swiss theme, so it carries every state. Follow the steps, and don't call it done until each rule holds.

## Steps

1. **Reuse first.** Read `src/components/` and the code that needs the element. Extend a component that already covers the need rather than add a second one.
2. **Place it.** Domain-free: `src/components/<name>.tsx`, a kebab-case file with a PascalCase export, or a folder when it needs several files. What a feature composes from components stays in `src/features/<feature>/`; `src/app/` holds routes only.
3. **Start from shadcn.** Read its version without installing it: `pnpm dlx shadcn@latest add <name> --view <name>.tsx` writes nothing. Its classes are the checklist: every state and attribute it handles (hover, focus, disabled, invalid, checked or open, placeholder, the enlarged hit area) gets handled here too. Install with `add` only for a widget HTML lacks, such as a combobox or a menu, then undo what CLAUDE.md says `add` does: `globals.css`, the font, packages nothing imports.
4. **Fit it to the repo.**
    - Base: the native element where HTML has one, even where shadcn wraps a Base UI primitive, as `sheet.tsx` uses `dialog`. Its `data-checked:` or `data-open:` states become `checked:` or `open:`.
    - Classes: keep its states, mapped to this repo's tokens and to rule 3; drop `rounded-*`, `shadow-*`, `dark:` (the theme is dark only), its focus `ring-*` (the global outline covers focus), arbitrary values, and `group-has-*` hooks for shadcn parts this repo doesn't have, such as `Field`.
    - Imports: `cn` from `cn`, and icons from `icons.tsx`, never `lucide-react`.
    - API: as rule 8. `button.tsx`, `input.tsx` and `table.tsx` are the models.
5. **Walk the rules** below, one at a time, each state on both backgrounds.
6. **Replace the copies.** Switch every place in `src/` that hand-rolls the same element to the new component, in the same PR.
7. **Look at it.** Screenshot a page that uses it against a running `pnpm dev`, asking before you start one: `google-chrome --headless --window-size=1280,900 --screenshot=<file> http://localhost:3000/<path>`, and again at `--window-size=390,844` for a phone. Say plainly which states it couldn't show: hover, pressed and focus need a pointer or a keyboard.
8. **Check.** `pnpm format`, `pnpm lint`, `pnpm typecheck` and `pnpm test`.
9. **Record.** A new rule the component brings goes into this skill, and into CLAUDE.md only when it holds outside components.

## Rules

1. **A wrapper, always.** Every reusable element lives in `src/components/`, with no domain knowledge, even when no library is behind it, so a later library swap changes one file.
2. **Native elements first.** A real `<button>`, `<a>`, `<input>`, `<dialog>` or `<details>`, never a `div` with a click handler; a Base UI primitive only for a widget HTML lacks. State goes in ARIA (`aria-pressed`, `aria-current`, `aria-expanded`, `aria-invalid`), and an icon-only control has an `aria-label` and an `IconLabel`.
3. **Every state, on both backgrounds.**
    - rest;
    - hover: `bg-accent`, or a lighter text colour; `primary` uses `bg-ring`;
    - pressed: `active:bg-input`; `primary` uses `active:bg-primary/80`;
    - keyboard focus: the global teal outline, or `border-ring` with `outline-hidden` on an input;
    - disabled: `pointer-events-none` and 50% opacity;
    - invalid: `aria-invalid:border-destructive`;
    - selected or current: filled teal.

    Each state must show on `--background` and on `--popover`, the panel. Only what does something gets hover and pressed: a table row only when it opens something (`variant="link"`).
4. **Motion.** Colour changes use `transition-colors`. Anything that moves or loops has a reduced-motion fallback that stays readable, as `.shimmer` does.
5. **Phones.** Nothing depends on hover: Tailwind's `hover:` applies only on devices that can hover, so what a hover reveals, a tap or focus reveals too. A text input is 16px below `md` (`text-base md:text-sm`, as shadcn's `Input` has it), or iOS Safari zooms in when it takes focus. A checkbox and its label are one hit target. A small button widens its hit area the way shadcn's checkbox does (`relative` with `after:absolute after:-inset-x-3 after:-inset-y-2`); an `<input>` can't hold `::after`, so its `<label>` does that job.
6. **Content.** A pending action disables its button and names what is happening, as the import form's "Importing…" does. A wide table scrolls in its own box, as `Table` does. An empty part is left out unless the whole page or chart is empty (CLAUDE.md's copy rule).
7. **Tokens and look.** Theme tokens and the type scale (`.type-*`, `text-note`), no raw colours and no arbitrary values; a value needed twice becomes a token. The Swiss look is as CLAUDE.md's UI section sets it, `<Money>` and `<Change>` included.
8. **Shape.** Native props pass through (`React.ComponentProps<"input">`). Variants and sizes are maps (`variants`, `sizes`), never boolean props that switch the look. Parts that belong together are separate exports that compose, as `Table`, `TableRow` and `TableCell` do. `className` is merged last with `cn`, for layout only (margin, width, position): a new look is a variant. A `xClass()` helper is exported only when a non-component element, such as a `Link`, needs the same look.
9. **React.** No `useEffect` or `useRef` unless no HTML or React equivalent exists. No inline arrow handlers; use `useCallback`. Name the function inside `memo()`.
10. **Proof.** The screenshots of step 7. No tests on class names; test behaviour only, such as a keyboard path. A wrapper that adds nothing to its native element's behaviour gets no test. The repo's Vitest runs in Node with no DOM, so for a component with behaviour of its own, say what test it needs instead of adding a test setup.
