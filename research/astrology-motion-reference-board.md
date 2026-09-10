# Astrology Motion Reference Board

## Direction

The redesign combines several compatible principles rather than copying one site: a living but readable hero, an object that persists across sections, scroll-pinned narrative scenes, mask-based image transitions, large kinetic type, and a restrained final convergence around the booking action.

## Hero references

1. **Codrops — Layered Zoom Scroll Effect**
   - Source: Codrops.
   - Screen behavior: multiple masked image layers scale at different rates and create depth.
   - Useful mechanic: depth through scale rather than random particles.
   - Use here: hero portrait/lens and transition into the next section.
   - Code/component: tutorial and code are available.
   - Original stack: GSAP, ScrollTrigger, ScrollSmoother, CSS masks.
   - Adaptation: one portrait and a symbolic lens, without a heavy gallery stack.
   - Mobile: fewer layers and no blur animation.
   - Performance: moderate; masks and transforms only.

2. **Codrops — Telescope Zoom Animation on Scroll**
   - Source: Codrops Creative Hub.
   - Screen behavior: the central visual expands as if the camera moves through it.
   - Useful mechanic: a single object becomes the transition itself.
   - Use here: hero lens grows into the following scene.
   - Code/component: demo code available.
   - Original stack: GSAP.
   - Adaptation: softer, slower motion tied to the idea of moving from uncertainty toward clarity.
   - Mobile: reduced travel distance.
   - Performance: low to moderate.

3. **Codrops — Scroll-Synced Video with Keyhole Effect**
   - Source: Codrops Creative Hub.
   - Screen behavior: video progress follows scroll through a keyhole-like aperture.
   - Useful mechanic: an aperture connects narrative and image.
   - Use here: conceptual reference for the portrait lens, implemented without heavy video.
   - Code/component: demo code available.
   - Original stack: GSAP and video.
   - Adaptation: Canvas/SVG/CSS composition instead of a large video asset.
   - Mobile: static poster-like composition.
   - Performance: lighter than the original.

4. **Codrops — Accessible WebGL Text**
   - Source: Codrops Creative Hub.
   - Screen behavior: expressive rendered text remains paired with accessible DOM text.
   - Useful mechanic: visuals do not replace semantic content.
   - Use here: hero heading remains real HTML while the background reacts separately.
   - Code/component: demo code available.
   - Original stack: Three.js/WebGL.
   - Adaptation: Canvas background plus semantic typography.
   - Mobile: static/low-frame background.
   - Performance: low.

5. **React Bits animated backgrounds and text reveals**
   - Source: React Bits.
   - Screen behavior: isolated interactive effects with reusable controls.
   - Useful mechanic: separation of decorative rendering from content.
   - Use here: reference for the living background architecture and reduced-motion fallback.
   - Code/component: reusable components available.
   - Original stack: React.
   - Adaptation: rewritten in Vanilla JS to match the current project.
   - Mobile: reduced density and frame rate.
   - Performance: low when limited to one canvas.

## Section transition references

1. **Codrops — SVG Mask Transitions on Scroll**
   - Mechanic: horizontal blinds, vertical blinds and grid reveals tied to scroll.
   - Use here: full-screen light/dark section curtains and image reveal language.
   - Code: tutorial and code available.
   - Stack: GSAP, ScrollTrigger, SVG masks, optionally Lenis.
   - Adaptation: fewer mask cells, no smooth-scroll dependency.
   - Mobile: 4–6 cells instead of desktop density.
   - Performance: moderate.

2. **Codrops — Rotated Overlays**
   - Mechanic: a large overlay rotates/slides away and reveals the next scene.
   - Use here: menu and one major section transition.
   - Code: tutorial available.
   - Stack: CSS/GSAP.
   - Adaptation: circular/diagonal editorial curtain matching the brand geometry.
   - Mobile: simple vertical curtain.
   - Performance: low.

3. **Codrops — Full Image Reveal Effect**
   - Mechanic: foreground thumbnails move away while a fullscreen image appears behind them.
   - Use here: small portrait becomes a larger scene.
   - Code: demo available.
   - Stack: GSAP/TweenMax in original.
   - Adaptation: modern transform/clip-path implementation.
   - Mobile: direct mask expansion.
   - Performance: low.

4. **Codrops — CSS Mask Transition**
   - Mechanic: animated mask sprite reveals the next visual.
   - Use here: conceptual reference for organic reveal edges.
   - Code: tutorial available.
   - Stack: CSS masks.
   - Adaptation: SVG/CSS mask with fallback, not a large sprite sheet.
   - Mobile: clip-path fallback.
   - Performance: low to moderate.

5. **Codrops — WebGL Gallery page transitions**
   - Mechanic: clicked image travels seamlessly into the detail view while DOM and WebGL stay synchronized.
   - Use here: continuity principle between sections, not full WebGL implementation.
   - Code: tutorial available.
   - Stack: Three.js, GSAP, Astro, Barba.js.
   - Adaptation: one persistent DOM/SVG object across the homepage.
   - Mobile: simplified scale transition.
   - Performance: substantially lighter than original.

## Kinetic typography references

1. **Codrops — 3D Text Scroll Animations**
   - Mechanic: text depth and perspective respond to scroll.
   - Use here: large statement scene before the services narrative.
   - Adaptation: 2D scale and tracking shifts to preserve Cyrillic rendering.

2. **Codrops typography demos**
   - Mechanic: repeated text bands and variable speed.
   - Use here: horizontal line of key phrases with differing scroll speeds.
   - Adaptation: restrained contrast, no endless marquee noise.

3. **Godly/Awwwards editorial hero patterns**
   - Mechanic: typography occupies the screen as composition, not decoration.
   - Use here: oversized headings crossing the persistent lens.
   - Adaptation: Cyrillic-first line breaks and readable semantic hierarchy.

## Image mask / transformation references

1. Pinned image mask reveal on scroll — Codrops Creative Hub.
2. SVG Mask Transitions on Scroll — Codrops.
3. Layered Zoom Scroll Effect — Codrops.

All three inform one portrait transformation: framed portrait → aperture → broad atmospheric field. The implementation avoids displacement shaders unless later profiling proves they are justified.

## Pinned scroll-scene references

1. GSAP ScrollTrigger pin/scrub patterns.
2. Pinned image mask reveal — Codrops.
3. Scroll-synced slideshow/keyhole — Codrops.

Use: services are presented as one staged sequence. Copy, color, scale and focal object change while the section remains pinned.

## Menu references

1. Rotated overlay reveal — Codrops.
2. Large editorial navigation patterns from Awwwards/Godly.
3. Mask-based full-screen menus from Codrops menu demos.

Use: full-screen menu with oversized labels, staged background changes and strong focus states. Mobile retains the same hierarchy but removes pointer-driven previews.

## Final CTA references

1. Fullscreen editorial end frames from Awwwards.
2. Object-convergence patterns from Godly showcase sites.
3. Overlay reveal mechanics from Codrops.

Use: earlier orbital lines return and converge around one booking action. The screen becomes quieter instead of adding another rectangular card.

## Technical decision

The current homepage foundation uses Canvas for the living background, CSS transforms/clip-path for most transitions and native IntersectionObserver/scroll calculations. GSAP ScrollTrigger remains the preferred upgrade path for the final pinned timeline because it explicitly supports pinning, scrubbed timelines, snapping and lifecycle cleanup. It should only be introduced when the local runnable checkout is available for profiling.

## Source sweep status

Reviewed directly in the current research pass: Codrops tutorials and Creative Hub, React Bits materials surfaced by search, official GSAP ScrollTrigger documentation, and Unsplash licensing. A broader visual sweep was also initiated across Awwwards/Godly categories. The remaining named directories in the brief must not be marked complete until each is opened in a browser during the local Playwright phase.
