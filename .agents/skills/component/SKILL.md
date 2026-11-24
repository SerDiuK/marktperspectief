---
name: component
description: Builds or extracts a reusable UI component in src/components/ with every interaction state. Use whenever a task needs a control or element the app doesn't have yet (a select, checkbox, text link, disclosure, badge or dialog), when the same markup is about to appear a second time, when a raw button, input, link or summary element would get its own classes outside src/components/, or when someone asks for a component, wrapper or reusable piece of UI, even if they never say "component".
---

# Component

Every reusable element is a component in `src/components/`: a wrapper over a native element that shows every state. Follow the steps, and don't call it done until each rule holds.

## Steps

1. **Reuse first.** Read `src/components/` and the code that needs the element. Extend a component that already covers the need rather than add a second one.
2. **Place it.** `src/components/<name>.tsx`, a kebab-case file with a PascalCase export, or a folder when it needs several files.
3. **Write the wrapper** over the native element: its native props (`React.ComponentProps<"input">`), `variants` and `sizes` maps where the look varies, and `className`. `button.tsx` and `input.tsx` are the models.
4. **Walk the rules** below, one at a time, each state on both backgrounds.
5. **Replace the copies.** Switch every place in `src/` that hand-rolls the same element to the new component, in the same PR.
6. **Look at it.** Screenshot a page that uses it against a running `pnpm dev`, asking before you start one: `google-chrome --headless --window-size=1280,900 --screenshot=<file> http://localhost:3000/<path>`. Say plainly which states it couldn't show: hover, pressed and focus need a pointer or a keyboard.
7. **Check.** `pnpm format`, `pnpm lint`, `pnpm typecheck` and `pnpm test`.
8. **Record.** A new rule the component brings goes into this skill, and into CLAUDE.md only when it holds outside components.

## Rules

1. **A wrapper, always.** Every reusable element lives in `src/components/`, with no domain knowledge, even when no library is behind it, so a later library swap changes one file.
2. **Native elements first.** A real `<button>`, `<a>`, `<input>`, `<dialog>` or `<details>`, never a `div` with a click handler. State goes in ARIA (`aria-pressed`, `aria-current`, `aria-expanded`), and an icon-only control has an `aria-label` and an `IconLabel`.
3. **Every state, on both backgrounds.**
    - rest;
    - hover: `bg-accent`, or a lighter text colour; `primary` uses `bg-ring`;
    - pressed: `active:bg-input`; `primary` uses `active:bg-primary/80`;
    - keyboard focus: the global teal outline, or `border-ring` with `outline-hidden` on an input;
    - disabled: `pointer-events-none` and 50% opacity;
    - selected or current: filled teal.

    Each state must show on `--background` and on `--popover`, the panel. Only what does something gets hover and pressed: a table row only when it opens something (`variant="link"`).
4. **Motion.** Colour changes use `transition-colors`. Anything that moves or loops has a reduced-motion fallback that stays readable, as `.shimmer` does.
5. **Phones.** A text input is 16px below `md` (`text-base md:text-sm`), or iOS Safari zooms in when it takes focus. A checkbox and its label are one hit target.
6. **Tokens only.** Theme tokens and the type scale (`.type-*`, `text-note`), no raw colours and no arbitrary values. A value needed twice becomes a token.
7. **Swiss look.** As CLAUDE.md's UI section sets it, `<Money>` and `<Change>` included.
8. **Shape.** Variants and sizes are maps (`variants`, `sizes`). `className` is merged last with `cn`, for layout only (margin, width, position): a new look is a variant. A `xClass()` helper is exported only when a non-component element, such as a `Link`, needs the same look.
9. **React.** No `useEffect` or `useRef` unless no HTML or React equivalent exists. No inline arrow handlers; use `useCallback`. Name the function inside `memo()`.
10. **Proof.** The screenshot of step 6. No tests on class names; test behaviour only, such as a keyboard path. A wrapper that adds nothing to its native element's behaviour gets no test. The repo's Vitest runs in Node with no DOM, so for a component with behaviour of its own, say what test it needs instead of adding a test setup.
