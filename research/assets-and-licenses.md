# Assets and licences

## Existing project assets

### `assets/212CB13A-DFA8-4E37-BF86-4F200A4A0E9A.png`

- Usage: primary portrait on the homepage and existing internal pages.
- Source: already present in the repository before the redesign branch.
- Ownership/licence status: not documented in the repository.
- Current decision: retain rather than replace, because it appears to be the astrologer's own portrait and is part of the factual brand identity.
- Required confirmation before external publication: confirm that the site owner has permission to publish and edit this photograph.
- Processing rules: crop only; no factual alteration of appearance; export derivatives as AVIF/WebP when a local asset pipeline is available.

## Generated graphics

### Canvas atmospheric field

- Source: original code created for this redesign.
- External assets: none.
- Licence: belongs to the project owner as project code.
- Content: procedural lines, gradients and moving focal points.
- Performance: density and frame updates are reduced on small screens and when reduced motion is requested.

### CSS/SVG orbital geometry and masks

- Source: original implementation informed by common mask and scroll-transition techniques.
- External assets: none.
- Licence: project code.
- Accessibility: decorative geometry is hidden from assistive technology; content remains in semantic HTML.

## Fonts

The existing project loads the following fonts from Google Fonts:

- Cormorant Garamond
- Unbounded
- Manrope

Before final delivery, their exact licence files should be preserved or linked in the repository documentation. Google Fonts families are generally distributed under open font licences, but the exact family pages and licence texts must be checked during the final dependency audit. The current redesign keeps the same families temporarily to avoid introducing unverified font files and to preserve Cyrillic coverage.

No font binaries are committed by this redesign stage.

## Potential external imagery

No new stock photograph has been committed at this stage.

Should Unsplash imagery be used later:

- the standard Unsplash licence permits free commercial and non-commercial use and modification;
- images may not be sold substantially unchanged;
- additional permission can still be required for recognisable people, trademarks, artworks or protected locations shown in a photograph;
- photographer attribution is recommended even when not mandatory.

Each downloaded image must be recorded here with:

- original page URL;
- photographer name;
- download date;
- licence type at download time;
- exact local filename;
- intended use;
- notes on model/property releases.

## Video

No stock or generated video has been added. The current hero intentionally uses a lightweight procedural Canvas scene instead of an arbitrary star-field video.

If a video is later introduced, delivery requires:

- recorded source and licence;
- silent seamless WebM and MP4 versions;
- poster image;
- mobile static alternative;
- preload set to metadata or none where appropriate;
- documented compressed sizes;
- verification that text contrast remains sufficient.

## Prohibited asset handling

- Do not use random zodiac stock packs.
- Do not copy visual assets from reference sites.
- Do not download social-media portraits without documented permission.
- Do not commit generated imagery without recording the generator, date and commercial-use terms.
- Do not claim that an asset is licensed when its provenance is unknown.

## Outstanding confirmations

1. Ownership/publication permission for the existing portrait.
2. Exact author and original source of the existing portrait.
3. Whether the project owner wants local self-hosted font files or continued Google Fonts delivery.
4. Whether additional approved portraits or detail photographs are available.
