# Prunus shared client portal — visual design contract

Status: implemented design for the shared client login and the signed-in website client workspace. This is the **portal** in client-portal/, not the Prunus Media public website, UK Trade Websites repository or Prunus Certificates.

## Scope and brand separation
- Shared login is the ONLY visual touchpoint deliberately displaying Prunus Media and UK Trade Websites together.
- Use a precise 50/50 vertical split on desktop. Left is Prunus Media floral and understated; right is UK Trade Websites, bold orange/navy diagonals.
- The sign-in card straddles the centre seam but is ONE functional email-code form. Do not create two auth systems, duplicate the form, or send login data to a marketing domain.
- On mobile the brand sections stack; the one authentication card follows and remains readable.
- After authentication, hide the co-branded login panel. The dashboard stays neutral: no Prunus + UK Trades masthead pair, no merged brand motif, no tenant data mixing.
- The existing UK Trades sign-in link continues via prunusmedia.com/client-login/ to portal.prunusmedia.com. Never import Prunus Certificates data, secrets, buckets, or auth sessions.

## Typography
- **Headings:** EB Garamond, medium weight, with Georgia serif fallback. Applies throughout dashboard, editorial calendar, admin tools, modal headings and sign-in text.
- **Body/UI labels:** Arial, Helvetica fallback. Readable 15–16px body copy; line-height at least 1.5. Buttons and form inputs inherit Arial.
- Prunus logo typography uses EB Garamond; UK Trade Websites wordmark intentionally uses a bold Arial brand treatment. Neither changes the headings/body convention.
- EB Garamond loads from Google Fonts with a narrow CSP allowlist: Google Fonts stylesheets and fonts.gstatic.com fonts. No additional third-party scripts.

## Colors and components
- Main canvas: warm cream #f8f2e9, not gray or pale blue.
- Card/surface: warm ivory #fffcf7.
- Borders: muted warm taupe #e8ded2; subdued body copy #655f5c.
- Prunus left: blush creams #fffaf4 and #f7eae2; floral pink #bd777e.
- UK Trades right: near-white canvas, navy #122f68 and orange #f76b0c diagonal bands.
- Main actions: deep charcoal-blue #253b43 with high contrast. Inputs are warm ivory with dark text and visible outlines.
- Signed-in interface uses consistent cream cards, warm tags/badges, restrained shadows, rounded 7–12px corners, and warm hover/focus states.
- Maintain accessible focus outlines, semantic form labels, role=status for sign-in errors, and proper hidden behavior.
- Respect reduced motion and responsive widths.

## Floral and trade graphics
- The floral art is a decorative, local, hand-drawn SVG (public/assets/prunus-botanical.svg), accessible with empty alt text and aria-hidden. It must not introduce another external request.
- The UK Trades stripes are CSS-only geometry behind its wordmark. Do not let them overlap or obscure actionable text.
- Logos are stylized HTML/CSS wordmarks, not claimed to be the exact official logo assets. Replace with approved official artwork in a separate scoped change if supplied.
- Don't reproduce marketing copy from the poster that inspired this visual direction.

## Functional boundaries
- No changes to OTP rate limits, auth cookies, database schema, lead information, tenant privileges, private R2 uploads or Resend credentials for a design-only release.
- The signed-in page keeps admin and client permissions as before. The header and footer become agency-neutral after sign-in and return to the shared labels on logout.
- Repo source is the implementation truth. Check client-portal/tests and GitHub portal deployment workflow for release. Test live code delivery and uploaded file isolation independently of green CI.


## App layout (November 2026)
- Desktop authenticated workspace: a compact, persistent **left sidebar** with Dashboard, Calendar, Blogs, Files, business details, and role-specific links. Sidebar is sticky and scrolls when needed; it must not duplicate the public marketing navigation.
- Mobile authenticated workspace: five-item **fixed bottom app navigation**, with safe-area padding, Home, Enquiries/Clients (role-dependent), Calendar, Blogs, and More. The More button opens an accessible closeable tool sheet; Escape and link selection dismiss it.
- Hide admin-only routes for client roles in the interface, but never rely on menu hiding for security. The API still requires membership/agency-admin rights.
- The signed-in dashboard has a small monthly calendar above the main sections. Click a day to filter that day's items; previous/next month changes load the matching data.
- Admin calendar shows planned articles and research-week markers across their customers, optionally filtered by business. Client calendar shows **only their own dated articles** and never internal research jobs.
- A planned publication date does **not** imply that the blog has been published or even approved. Undated requests must never be given guessed deadlines.
- Keep cream #f8f2e9, EB Garamond heading typography, Arial body copy, rounded ivory cards and visible focus states in every new navigation and calendar element.
- Desktop/sidebar + mobile/bottom-nav experience must remain consistent when a newly invited client signs in with no other customer accounts.
