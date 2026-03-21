# The Design System: Architectural Clarity for VisualAI Group

## 1. Overview & Creative North Star: "The Digital Atrium"
This design system is anchored by the Creative North Star of **"The Digital Atrium."** Like a high-end architectural space, the interface focuses on light, air, and structural integrity. We reject the "boxed-in" feel of traditional SaaS dashboards. Instead of rigid grids and heavy borders, we utilize **intentional asymmetry** and **tonal layering** to guide the eye.

The goal is an editorial-grade experience where the AI's complexity is housed within a "quiet" interface. We break the template look by using exaggerated white space (the 16 and 24 spacing tokens) and overlapping modular elements that feel like fine stationery resting on a polished stone surface.

---

## 2. Colors & Surface Philosophy
The palette moves beyond simple "light mode" into a sophisticated spectrum of cool grays and high-energy indigos.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to define sections. Layout boundaries must be achieved through:
- **Background Shifts:** Placing a `surface_container_low` sidebar against a `surface` main canvas.
- **Tonal Transitions:** Using `surface_container_highest` for a header to create a natural "shelf" without a stroke line.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of semi-translucent materials:
1.  **Base Layer:** `surface` (#f7f9fb) – The "floor" of the application.
2.  **Sectional Layer:** `surface_container_low` (#f2f4f6) – Used for large structural blocks like a sidebar.
3.  **Action Layer:** `surface_container_lowest` (#ffffff) – Reserved for cards, widgets, and primary workspaces to make them "pop" against the background.

### The Glass & Gradient Rule
To ensure the "VisualAI" brand feels premium, use **Glassmorphism** for floating elements (e.g., Workspace Switchers, Popovers). Use `surface_container_lowest` at 80% opacity with a `backdrop-blur` of 20px. 
For primary CTAs, apply a **Signature Texture**: a subtle linear gradient from `primary` (#2b4bb9) to `primary_container` (#4865d3) at a 135-degree angle to add "soul" to the action.

---

## 3. Typography: The Editorial Voice
We utilize a dual-typeface system to balance high-end brand authority with utilitarian precision.

*   **Display & Headlines (Manrope):** Chosen for its geometric elegance. Headlines (`headline-lg` to `headline-sm`) should use `on_surface` (#191c1e) with tight letter-spacing (-0.02em) to feel authoritative and "inked."
*   **Body & UI (Inter):** Used for all functional data. Inter provides maximum legibility at small sizes (`body-sm`, `label-md`). 
*   **The Hierarchy Strategy:** Use `primary` (#2b4bb9) sparingly in typography—only for active states or critical links—to keep the interface feeling calm and focused.

---

## 4. Elevation & Depth: Tonal Stacking
Traditional drop shadows are largely replaced by **Tonal Layering**.

*   **The Layering Principle:** Depth is "found," not "made." Place a `surface_container_highest` element inside a `surface_container_low` parent to create an inset, tactile feel.
*   **Ambient Shadows:** For "Floating" components (Modals/Avatars), use a soft, tinted shadow: `0px 20px 40px rgba(43, 75, 185, 0.06)`. By tinting the shadow with the `primary` hue, we mimic natural light refraction.
*   **The "Ghost Border":** If a separator is required for accessibility, use `outline_variant` (#c3c6d7) at **15% opacity**. Anything more creates "visual noise" that degrades the premium feel.

---

## 5. Component Guidelines

### Buttons (High-End Tactility)
*   **Primary:** Gradient fill (Primary to Primary Container), `xl` (0.75rem) roundedness. No border.
*   **Secondary:** `surface_container_high` fill with `on_surface_variant` text.
*   **Tertiary:** Ghost style; `primary` text, no background except on hover (`primary_fixed_dim` at 20% opacity).

### Cards & Kanban Widgets
*   **Rules:** Forbid divider lines within cards.
*   **Construction:** Use `surface_container_lowest` as the card base. Use `spacing.4` (1rem) for internal padding. Separate headers from content using a shift to `surface_container_low` for the header background, or simply use `title-sm` typography with a `spacing.6` vertical gap.

### Navigation & Sidebar
*   **Sidebar:** Collapsible, using `surface_container_low`. Active states should not use a "box" but a "pill" (`full` roundedness) in `secondary_fixed`.
*   **Workspace Switcher:** A "Glass" element with a `1px` Ghost Border. Use `title-md` for the workspace name to emphasize the high-end collaborative nature.

### Interactive Primitives
*   **Input Fields:** Use `surface_container_highest` for the field body. On focus, transition the background to `surface_container_lowest` and add a `2px` `primary` "Ghost Border" (20% opacity).
*   **Chips:** Use `secondary_fixed` for a "soft-tag" look. Avoid high-contrast fills for metadata.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use `spacing.12` and `spacing.16` for page-level margins to let the AI-generated content "breathe."
*   **Do** use `headline-lg` for dashboard titles to create a sense of scale and importance.
*   **Do** apply `xl` (0.75rem) roundedness to all primary containers to soften the "tech" feel into a "lifestyle" feel.

### Don’t:
*   **Don’t** use black (#000000). Always use `on_surface` (#191c1e) to maintain a soft, professional contrast.
*   **Don’t** use "divider" components. If you feel the need for a line, increase the vertical spacing (`spacing.8` or `10`) instead.
*   **Don’t** use standard "drop-shadow" presets. Every elevation must be a custom, low-opacity ambient tint.
*   **Don’t** crowd the sidebar. If an icon doesn't have a clear purpose, remove it to maintain the "Atrium" philosophy.