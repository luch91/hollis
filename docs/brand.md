# Hollis brand assets

## Identity

The Hollis mark is the Bound Record. Two vertical records are joined by a controlled curved band to represent policy, evidence, and human judgment bound into one defensible review record.

The production mark is deterministic vector geometry. The concept-rendering raster is not a production asset.

## Approved assets

- `apps/web/public/assets/hollis-mark.svg` is the primary deep-petrol mark for light surfaces.
- `apps/web/public/assets/hollis-mark-reversed.svg` is the warm-white mark for dark surfaces.
- `apps/web/src/app/icon.svg` is the application icon with a dark field.
- `apps/web/src/app/hollis-brand.tsx` is the product lockup used by the application.
- `apps/web/src/app/hollis-brand-assets.ts` is the framework-neutral geometry source used by document exports.

## Color

| Role | Value | Use |
| --- | --- | --- |
| Bound Record petrol | `#073954` | Primary mark on light surfaces and exported records |
| Reversed warm white | `#F5F4EC` | Mark on dark petrol surfaces |
| Application field | `#003D47` | App icon background and primary dark interface field |

The mark must remain one color. Interface state colors must not be applied to individual parts of the mark.

## Lockup

The preferred product lockup places the mark to the left of the `Hollis` wordmark. The wordmark uses the locally hosted Source Serif 4 at weight 600. The standalone mark is appropriate for application icons, compact navigation, document footers, and authenticated product surfaces where the Hollis name is already visible.

## Clear space and sizing

Maintain clear space on every side equal to at least one quarter of the displayed mark width. Do not display the standalone mark below 20 CSS pixels wide. Use the full lockup when the brand is introduced without nearby identifying text.

## Required handling

- Preserve the `64 × 64` view box and the original aspect ratio.
- Scale proportionally. Never stretch, shear, rotate, outline, crop, or redraw the mark.
- Do not add shadows, gradients, glow, texture, borders, or animation within the mark.
- Do not place the mark on a surface that prevents clear contrast.
- Keep organization logos visually separate from the Hollis mark in exported records.
- Do not imply trademark registration or clearance. Clearance and registration are separate legal work.
