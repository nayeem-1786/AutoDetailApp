# 7. CMS & Website Management

The Website section of the admin dashboard is the central hub for managing the public-facing website. It covers page creation, navigation, hero carousel, footer layout, announcement tickers, themes, SEO, catalog display, ads, global content blocks, team members, and credentials.

All Website management pages are accessed from **Admin** →**Website** in the left sidebar. The sidebar groups Website tools into four collapsible sections: **Content**, **Data**, **Layout**, and **Appearance**.

> Changes to most Website settings are cached and may take up to 60 seconds to appear on the live site.

---

## 7.1 Website Overview

Navigate to **Admin** →**Website** to see the overview dashboard. This page displays 15 section cards organized into groups, each linking to its management page:

| Group | Sections |
|-------|----------|
| **Content** | Homepage, Pages, Team Members, Credentials, Global Blocks |
| **Data** | City Pages, SEO |
| **Layout** | Hero, Navigation, Footer, Tickers, Ads, Catalog Display |
| **Appearance** | Theme & Styles, Seasonal Themes |

Each card shows the section name, a brief description, and a link to the management page.

---

## 7.2 Pages

Navigate to **Admin** →**Website** →**Pages** to manage CMS pages.

### Page List

The page list displays all custom pages in a table with these columns:

| Column | Description |
|--------|-------------|
| **Title** | Page title (clickable link to the editor) |
| **Slug** | URL path — pages are served at `/p/{slug}` |
| **Template** | Color-coded badge: `content` (blue), `landing` (purple), or `blank` (gray) |
| **Published** | Toggle switch — publishes or unpublishes the page |
| **In Nav** | Toggle switch — shows or hides the page in site navigation. Disabled when the page is unpublished. Auto-clears when a page is unpublished. |
| **Updated** | Last modification timestamp |

Click **New Page** to create a new page. This automatically creates a draft page titled "Untitled Page" with a timestamp-based slug and redirects to the page editor.

### Page Editor

The page editor is divided into several sections:

#### Page Settings

| Field | Description |
|-------|-------------|
| **Title** | The page title displayed in the browser tab and page header |
| **Slug** | URL path segment. Only lowercase letters, numbers, and hyphens are allowed. The full URL is shown below the field as a preview (e.g., `https://yoursite.com/p/about-us`). |
| **Template** | Controls the page layout. See the template options below. |

**Template Options:**

| Template | Behavior |
|----------|----------|
| **Content** | Standard page with a centered container and prose-formatted text. Best for text-heavy pages like About Us or Terms. |
| **Landing** | Full-width layout without container constraints. Best for marketing pages with hero sections and wide content blocks. |
| **Blank** | Renders content blocks only with no wrapper. Best for pages built entirely from content blocks. |

#### Content (HTML Editor)

A rich HTML editor for the page's main body content. The editor includes the full HTML editor toolbar (see Section 7.3) and an AI Draft panel.

**AI Draft Panel:**
1. Click the AI wand button in the toolbar to open the AI Draft panel
2. Enter a prompt describing the content you want
3. Select a tone: Professional, Casual, or Friendly
4. Click **Generate**
5. If the page already has content, a confirmation dialog asks whether to replace it

#### Content Blocks

Below the main HTML content area, the Content Blocks section allows you to add structured content blocks to the page. Content blocks render below the HTML content area. See Section 7.11 for the full list of block types and their editors.

Actions available in the content blocks section:
- **AI Generate Content** — Generates a full set of content blocks for the page using AI. If blocks already exist, a confirmation dialog asks whether to regenerate.
- **Add block** — Click any block type button to add a new block of that type
- **Insert Global Block** — Insert a shared global block (see Section 7.12)
- **Drag to reorder** — Drag the grip handle on any block to change its position
- **Expand/collapse** — Click a block row to expand its editor
- **AI Improve** — Available on each block, uses AI to enhance the content
- **Toggle active** — Show or hide individual blocks without deleting them
- **Delete** — Permanently removes a page-scoped block. For global blocks, removes the block from this page only.

#### SEO

The SEO section within the page editor provides per-page search engine optimization fields:

| Field | Description | Ideal Length |
|-------|-------------|-------------|
| **Meta Title** | Title shown in search results | 50-60 characters |
| **Meta Description** | Description shown in search results | 150-160 characters |
| **OG Image** | Social sharing image (upload) | 1200x630px |

Character count indicators appear next to the title and description fields: green when within the ideal range, amber when below, and red when over the limit.

Click **AI Generate** to have AI populate the meta title and description based on the page content.

#### Publishing

| Control | Description |
|---------|-------------|
| **Published** | Toggle to publish or unpublish the page |
| **Show in Navigation** | Toggle to add or remove the page from the site navigation. Disabled when the page is unpublished. |

#### Revision History

An expandable section at the bottom of the page editor showing the history of saved versions. Each revision entry shows:
- The date and time the revision was created
- A **View** button to see the revision content
- A **Restore** button to revert the page to that revision

#### Preview

Click the **Preview** button in the page header to generate a preview URL. This opens the page in a new tab without requiring it to be published.

---

## 7.3 HTML Editor Toolbar

The HTML editor toolbar appears in the page content editor, footer column editors, credential descriptions, and other CMS content areas. The toolbar provides formatting and layout tools organized into button groups.

Some buttons are only available in certain contexts. Buttons marked "CMS only" appear when editing CMS pages but not in the footer editor.

### Group 1 — Text Formatting

| Button | What It Does |
|--------|-------------|
| **Bold** | Wraps selected text in `<strong>` tags |
| **Italic** | Wraps selected text in `<em>` tags |
| **Heading** | Dropdown with three options: H2, H3, H4. Wraps selected text or inserts a heading tag at the appropriate level. |
| **Link** | Prompts for a URL, then wraps selected text in an `<a>` tag. If no text is selected, prompts for both link text and URL. |

### Group 2 — Media

| Button | What It Does |
|--------|-------------|
| **Image** | Opens the image manager dialog for uploading or selecting images. Inserts an `<img>` tag with the selected image URL. |
| **Video Embed** | *(CMS only)* Prompts for a YouTube or Vimeo URL and inserts a responsive video embed. |
| **Icon** | Opens the Icon Picker dialog with a curated set of Lucide icons. Select an icon, choose size and color, then insert it as an inline SVG. |

### Group 3 — Layout

| Button | What It Does |
|--------|-------------|
| **Button** | Inserts a styled button element. Prompts for button text and URL. |
| **Divider** | Inserts a horizontal rule (`<hr>`) for visual separation. |
| **Spacer** | Dropdown with four size options: Small (16px), Medium (32px), Large (48px), Extra Large (64px). Inserts a blank div of the selected height. |
| **Table** | Inserts an HTML table structure with header row and body rows. |
| **Columns** | *(CMS only)* Inserts a responsive multi-column layout container. |

### Group 4 — Blocks

| Button | What It Does |
|--------|-------------|
| **Callout** | *(CMS only)* Inserts a styled callout/alert box for highlighting important information. |
| **Accordion/FAQ** | *(CMS only)* Inserts an expandable accordion section for FAQ-style content. |
| **Social Links** | Inserts a set of social media icon links. |
| **Map** | Inserts an embedded Google Maps iframe. Prompts for the map embed URL. |
| **Embed** | Inserts a generic embed block for third-party widgets or scripts. |
| **List** | Inserts a formatted list structure (ordered or unordered). |

### Right Side

| Button | What It Does |
|--------|-------------|
| **Preview** | Toggles between the raw HTML editor and a rendered preview of the content. The icon switches between an eye (preview active) and an eye-off (editing active). |

### AI Draft

The AI Draft button (wand icon) opens a panel below the toolbar:

1. **Prompt** — Textarea where you describe the content you want generated
2. **Tone** — Selector with three options: Professional, Casual, Friendly
3. **Generate** — Sends the prompt to the AI content writer and replaces the editor content with the result
4. If the editor already has content, a confirmation dialog appears before replacing

---

## 7.4 Hero Carousel

Navigate to **Admin** →**Website** →**Hero** to manage the hero section that appears at the top of the homepage.

### Carousel Configuration

At the top of the page, the carousel settings control how slides are displayed:

| Setting | Options | Description |
|---------|---------|-------------|
| **Mode** | Single / Carousel | Single shows one static slide. Carousel rotates through all active slides. |
| **Interval** | 3-10 seconds | Time each slide is displayed before transitioning (carousel mode only) |
| **Transition** | Fade / Slide | Animation style between slides |
| **Pause on Hover** | On / Off | Whether the carousel pauses when the user hovers over it |

### Slide List

Below the carousel settings, all slides are listed with:
- A thumbnail preview
- The slide title
- An **Active** toggle to enable or disable the slide
- **Up/Down** arrows to reorder slides
- A **Delete** button

Click a slide to open the slide editor, or click **New Slide** to create one.

### Slide Editor

The slide editor is organized into sections based on the selected content type.

#### Content Type

Each slide has a content type that determines what is displayed:

| Content Type | Description |
|-------------|-------------|
| **Image** | A static background image with text overlay |
| **Video** | A video background (YouTube or Vimeo URL) with text overlay |
| **Before/After** | A side-by-side or slider comparison of two images |

#### Text Content

These fields appear for all content types:

| Field | Description |
|-------|-------------|
| **Title** | Main headline text displayed on the slide |
| **Subtitle** | Supporting text below the title |
| **CTA Text** | Button label (e.g., "Book Now") |
| **CTA URL** | Link destination when the button is clicked |
| **Text Alignment** | Left, Center, or Right alignment of the text overlay |
| **Overlay Opacity** | 0-100% — controls the darkness of the overlay behind the text |

#### Image Fields (Image content type)

| Field | Description |
|-------|-------------|
| **Desktop Image** | Primary background image (required) |
| **Mobile Image** | Optional smaller image optimized for mobile screens |
| **Alt Text** | Accessibility description for the image |

#### Video Fields (Video content type)

| Field | Description |
|-------|-------------|
| **Video URL** | YouTube or Vimeo video URL |
| **Poster Image** | Thumbnail/poster image shown before the video loads |

#### Before/After Fields (Before/After content type)

| Field | Description |
|-------|-------------|
| **Before Image** | The "before" comparison image |
| **After Image** | The "after" comparison image |
| **Before Label** | Text label for the before side (e.g., "Before") |
| **After Label** | Text label for the after side (e.g., "After") |

#### Color Overrides

Six optional color fields let you customize the slide's appearance without changing the site theme:

| Field | Description |
|-------|-------------|
| **Text Color** | Override the main title text color |
| **Subtitle Color** | Override the subtitle text color |
| **Accent Color** | Override the accent/highlight color |
| **Overlay Color** | Override the background overlay color |
| **CTA Background** | Override the CTA button background color |
| **CTA Text Color** | Override the CTA button text color |

Each field uses a hex color picker. Leave blank to use the site theme defaults.

---

## 7.5 Navigation

Navigate to **Admin** →**Website** →**Navigation** to manage the site's header and footer navigation menus.

### Placements

The navigation manager has two placement tabs:

| Placement | Where It Appears |
|-----------|-----------------|
| **Header** | The main navigation bar at the top of every page |
| **Footer Quick Links** | A links column in the footer section |

Switch between placements by clicking the tab at the top of the page.

### Navigation Items

Each placement shows a list of navigation items that can be reordered, nested, and edited. Each item displays:
- The link label
- The URL or route
- A target indicator (same tab or new tab)
- Drag handle for reordering

### Adding a Link

Click **Add Link** to open the add link dialog. There are three link type options:

| Link Type | Description |
|-----------|-------------|
| **Custom URL** | Enter any URL path (e.g., `/about` or `https://external.com`). Supports both internal paths and external URLs. |
| **Existing Page** | Select from a dropdown of all published CMS pages. The URL is automatically set to `/p/{slug}`. |
| **Built-in Route** | Select from a list of predefined routes in the system. |

**Built-in Routes:**

| Route | URL Path |
|-------|----------|
| Services | `/services` |
| Products | `/products` |
| Gallery | `/gallery` |
| Book Now | `/book` |
| Sign In | `/signin` |
| My Account | `/account` |
| Terms & Conditions | `/terms` |

Additional fields when adding a link:

| Field | Description |
|-------|-------------|
| **Label** | The text displayed in the navigation menu |
| **Target** | `Same Tab` (_self) or `New Tab` (_blank) |
| **Parent** | Select a parent item to nest this link under it (max 2 levels deep) |

### Bulk Add Published Pages

Click **Add Published Pages** to automatically create navigation items for all published CMS pages that are not already in the current placement.

### Reordering and Nesting

- **Drag and drop** — Drag items by the grip handle to reorder them
- **Nesting** — Indent a navigation item under another to create a dropdown or submenu (maximum 2 levels of nesting)
- **Editing** — Click the edit button on any item to modify its label, URL, or target
- **Deleting** — Click the delete button to remove an item from the navigation

---

## 7.6 Footer

Navigate to **Admin** →**Website** →**Footer** to configure the site footer. The footer is built from three collapsible sections, each with its own enable/disable toggle.

### Footer Sections

| Section | Description |
|---------|-------------|
| **Main Footer** | The primary footer area with configurable columns |
| **Service Areas** | A section listing the cities and areas the business serves |
| **Bottom Bar** | The copyright bar at the very bottom with legal links |

Each section has a toggle switch to enable or disable it independently.

### Main Footer — Column Management

The main footer section uses a **12-unit grid system**. Columns are placed within this grid and their widths are controlled by span values.

#### Grid Rules

| Rule | Value |
|------|-------|
| **Maximum active columns** | 6 |
| **Grid units total** | 12 |
| **Minimum column span** | 2 |

The **Column Width Preview** bar at the top of the main footer panel shows a visual representation of how the columns fill the grid. The status indicator shows:
- Green with a checkmark when the total equals 12
- Amber when there are unused units
- Red when the total exceeds 12

#### Adding a Column

Click **Add Column** and fill in:

| Field | Description |
|-------|-------------|
| **Column Title** | The heading displayed above the column content |
| **Content Type** | The type of content the column will contain |

**Content Type Options:**

| Type | Description |
|------|-------------|
| **Links** | A list of clickable links. Links are managed through the navigation system. |
| **HTML** | Free-form HTML content. Uses the HTML editor toolbar for formatting. |
| **Business Info** | Automatically displays business contact information pulled from Business Settings. |
| **Brand** | Logo, tagline, and contact toggles. Only one brand column can exist. Configuration includes logo width, tagline text, and toggles for showing phone, email, address, and review badges. |

#### Column Controls

Each column card provides:
- **Drag handle** — Reorder columns by dragging
- **Title** — Click to edit inline
- **Content type badge** — Color-coded: Links (blue), HTML (default), Business Info (green), Brand (amber)
- **Span input** — Set the column width (2-12 grid units)
- **Enable/Disable toggle** — Disabled columns do not count toward grid units or the 6-column limit
- **Delete** — Remove the column (links are unassigned, not deleted)

#### Brand Column

The brand column has a specialized editor with:

| Setting | Description |
|---------|-------------|
| **Logo Width** | Width of the logo image (40-400px) |
| **Tagline** | Text displayed below the logo |
| **Show Phone** | Toggle to display the business phone number |
| **Show Email** | Toggle to display the business email |
| **Show Address** | Toggle to display the business address |
| **Show Reviews** | Toggle to display review badges |

### Service Areas Section

When enabled, this section automatically displays the cities configured in the City Pages section (see Section 7.10). The layout and styling are managed through the section's settings.

### Bottom Bar

The bottom bar section manages the copyright text and legal links displayed at the very bottom of the page.

**Bottom Links** are simple text + URL pairs (e.g., "Privacy Policy", "Terms of Service") that appear in the bottom bar alongside the copyright text.

---

## 7.7 Announcement Tickers

Navigate to **Admin** →**Website** →**Tickers** to manage scrolling announcement banners.

### Prerequisites

Tickers require the **Announcement Tickers** feature flag to be enabled in **Admin** →**Settings** →**Feature Toggles**. If the feature is disabled, the tickers page shows a warning banner.

### Master Toggle

A master toggle at the top of the page enables or disables all tickers globally. Individual tickers can be toggled on and off independently, but none will display if the master toggle is off.

### Ticker List

Tickers are grouped by placement:

| Placement | Where It Appears |
|-----------|-----------------|
| **Top Bar** | A narrow banner above the site header |
| **Between Sections** | A banner inserted between content sections on the page |

Within each group, tickers are listed with:
- The message text
- Background and text color previews
- An active toggle
- Up/down arrows for reordering within the group

### Multi-Ticker Rotation

When two or more tickers are active within the same placement, rotation options appear for that placement group:

| Setting | Options | Description |
|---------|---------|-------------|
| **Text Entry** | Scroll, Right-to-Left, Left-to-Right, Top-to-Bottom, Bottom-to-Top, Fade In | How each ticker's message enters the screen. "Scroll" uses a continuous marquee. Other options animate the message in, hold it centered, then transition. |
| **Background Transition** | Crossfade, Slide Down, None | How the background changes between tickers |
| **Hold Duration** | 1-30 seconds | How long each ticker is displayed before transitioning to the next |

When only one ticker is active in a placement, it always displays as a continuous scrolling marquee.

### Creating / Editing a Ticker

Click **New Ticker** or click an existing ticker to open the ticker editor. The editor has a live preview at the top that shows the ticker as it will appear on the site.

#### Ticker Fields

| Field | Description |
|-------|-------------|
| **Message** | The text displayed in the ticker. Supports inline HTML for formatting. |
| **Link URL** | Optional URL — if set, the ticker becomes clickable |
| **Link Text** | Optional text for the link (displayed alongside or instead of the message) |
| **Placement** | Top Bar or Between Sections |
| **Section Position** | *(Between Sections only)* Where the ticker appears relative to page sections |
| **Font Size** | Extra Small, Small, Base, or Large |
| **Background Color** | Hex color for the ticker background (with color picker) |
| **Text Color** | Hex color for the ticker text (with color picker) |
| **Scroll Speed** | 1-100 slider controlling marquee speed (maps to 30-300 pixels/second) |
| **Message Gap** | 1-100 rem slider controlling the space between repeated message copies in the marquee |
| **Target Pages** | Which pages the ticker appears on (checkboxes) |
| **Start Date** | Optional date/time when the ticker becomes active |
| **End Date** | Optional date/time when the ticker automatically deactivates |

#### Section Positions

When placement is set to "Between Sections", the following positions are available:

| Position | Description |
|----------|-------------|
| **After Hero** | Below the hero carousel |
| **After Services** | Below the services section |
| **After Reviews** | Below the reviews/testimonials section |
| **Before CTA** | Above the call-to-action section |
| **Before Footer** | Above the footer |

> Not all positions are available on every page type. When a position is not available on a given page, the ticker falls back to the next available position in the chain.

#### Target Pages

Checkboxes let you control which pages display the ticker:

| Target | Description |
|--------|-------------|
| **All Pages** | Show on every page (overrides individual selections) |
| **Home** | Homepage only |
| **CMS Pages** | Custom CMS pages |
| **Products** | Product listing and detail pages |
| **Services** | Service listing and detail pages |
| **Areas** | City/service area landing pages |
| **Gallery** | Photo gallery page |
| **Cart** | Shopping cart page |
| **Checkout** | Checkout page |
| **Account** | Customer portal pages |

---

## 7.8 Themes

The theme system has two layers: **Site Theme Settings** (the permanent base theme) and **Seasonal Themes** (temporary overrides that activate on a schedule).

### Site Theme Settings

Navigate to **Admin** →**Website** →**Theme & Styles** to configure the base site theme. The settings are organized into three tabs.

> When a seasonal theme is active, a warning banner appears at the top of this page indicating that seasonal overrides may be taking priority over site theme settings.

#### Colors Tab

The Colors tab organizes color settings into five groups:

**Background Colors:**

| Token | Description |
|-------|-------------|
| **Page Background** | Main page background color |
| **Card Background** | Background for card and container elements |
| **Header Background** | Site header background |
| **Footer Background** | Site footer background |
| **Alt Section Background** | Alternating section background for visual rhythm |

**Text Colors:**

| Token | Description |
|-------|-------------|
| **Primary Text** | Main body text color |
| **Secondary Text** | Subheadings and supporting text |
| **Muted Text** | Placeholder text, labels, captions |
| **On Primary** | Text color used on primary-colored backgrounds |

**Brand / Accent Colors:**

| Token | Description |
|-------|-------------|
| **Primary** | Main brand color used for buttons, links, and accents |
| **Primary Hover** | Hover state for primary-colored elements |
| **Accent** | Secondary accent color |
| **Accent Hover** | Hover state for accent-colored elements |

**Link Colors:**

| Token | Description |
|-------|-------------|
| **Link** | Default link text color |
| **Link Hover** | Hover state for links |

**Border Colors:**

| Token | Description |
|-------|-------------|
| **Border** | Standard border color |
| **Light Border** | Lighter border for subtle separations |
| **Divider** | Color for horizontal rules and dividers |

Each color field has a hex color picker.

#### Typography Tab

| Setting | Description |
|---------|-------------|
| **Body Font** | The font used for body text throughout the site |
| **Heading Font** | The font used for headings (H1-H6) |

Both fields are dropdown selectors with a curated list of web fonts.

#### Buttons Tab

Button styling is configured for two button types:

**Primary Button:**

| Setting | Description |
|---------|-------------|
| **Background** | Button background color |
| **Text** | Button text color |
| **Hover Background** | Background color on hover |
| **Border Radius** | Corner rounding (e.g., `0.375rem`, `9999px` for pill shape) |

**CTA Button:**

| Setting | Description |
|---------|-------------|
| **Background** | CTA button background color |
| **Text** | CTA button text color |
| **Hover Background** | Background color on hover |
| **Border Radius** | Corner rounding |

#### Quick Presets, Export, Import, and Reset

The theme settings page header includes four actions:

| Action | Description |
|--------|-------------|
| **Quick Presets** | Dropdown with predefined color schemes to apply as a starting point |
| **Export** | Downloads the current theme settings as a JSON file |
| **Import** | Uploads a previously exported JSON file to restore theme settings |
| **Reset** | Reverts all settings to the system defaults |
| **Preview** | Opens the site in a new tab to see the current theme |

### Seasonal Themes

Navigate to **Admin** →**Website** →**Seasonal Themes** to manage temporary theme overrides that activate on a schedule.

#### Theme List

The seasonal themes page shows all themes with:
- Theme name and description
- Particle effect badge (if configured)
- "Auto" badge (if auto-activate is enabled)
- Start and end dates
- **Activate / Deactivate** toggle

#### Creating a Seasonal Theme

Click **New Theme** to create a theme from scratch, or select from one of eight built-in presets:

| Preset | Description |
|--------|-------------|
| **Christmas** | Red and green palette with snowfall particles |
| **Halloween** | Orange and purple palette with sparkle particles |
| **4th of July** | Red, white, and blue palette with fireworks particles |
| **Memorial Day** | Patriotic palette with star particles |
| **Presidents' Day** | Navy and gold palette with star particles |
| **Valentine's Day** | Pink and red palette with heart particles |
| **Fall / Autumn** | Warm orange and brown palette with leaf particles |
| **New Year** | Gold and black palette with confetti particles |

Each preset pre-fills the color overrides, particle effects, and themed ticker message.

#### Seasonal Theme Editor

The theme editor is organized into these sections:

**Basic Info:**

| Field | Description |
|-------|-------------|
| **Name** | Theme display name |
| **Slug** | URL-safe identifier (auto-generated from name) |
| **Description** | Optional description of the theme |

**Color Overrides:**

The color overrides section contains fields for overriding the site theme's brand colors during the seasonal period. Available color keys:

| Key | Description |
|-----|-------------|
| **lime** | Primary brand color |
| **lime-50** through **lime-600** | Brand color tints and shades |
| **brand-dark** | Dark brand variant |
| **brand-surface** | Brand surface/background color |
| **accent-glow-rgb** | RGB values for the accent glow effect |
| **Body Background** | Override the page background color |
| **Hero Gradient** | Override the hero section gradient |

Each field uses a hex color picker.

> Seasonal theme color overrides take the highest priority: CSS defaults < Site theme settings < Seasonal theme overrides.

**Particle Effect:**

| Setting | Description |
|---------|-------------|
| **Effect Type** | None, Snowfall, Fireworks, Confetti, Hearts, Leaves, Stars, Sparkles |
| **Intensity** | 10-100 slider controlling particle density |
| **Particle Color** | Hex color for the particles |

**Themed Ticker:**

| Setting | Description |
|---------|-------------|
| **Message** | Seasonal ticker message text |
| **Background Color** | Ticker background color |
| **Text Color** | Ticker text color |

When a seasonal theme is active and has a themed ticker configured, this ticker is displayed in addition to any manually created tickers.

**Schedule:**

| Setting | Description |
|---------|-------------|
| **Start Date** | Date and time the theme activates |
| **End Date** | Date and time the theme deactivates |
| **Auto-Activate** | When enabled, the theme automatically activates and deactivates based on the start/end dates |

**Background:**

| Setting | Description |
|---------|-------------|
| **Hero Background Image** | Upload a seasonal background image for the hero section |

**Actions:**

| Action | Description |
|--------|-------------|
| **Preview** | Opens the site with the seasonal theme applied for preview |
| **Export** | Downloads the theme configuration as a JSON file for backup or transfer |
| **Import** | Uploads a previously exported JSON file to restore a theme |

---

## 7.9 SEO Manager

Navigate to **Admin** →**Website** →**SEO** to manage search engine optimization settings for every page on the site.

### Page List

The SEO manager displays all indexable pages in a searchable, filterable list. Each page row shows:
- Page path and page type badge
- SEO score badge (color-coded: green for Good 80+, amber for Needs Work 50-79, red for Poor 0-49)
- Focus keyword (if set)
- Expandable inline editor

#### Filters

| Filter | Options |
|--------|---------|
| **Search** | Search by page path |
| **Page Type** | All Types, Homepage, Service Category, Service Detail, Product Category, Product Detail, Gallery, Booking, City Landing, Custom |
| **Score** | All Scores, Good (80+), Needs Work (50-79), Poor (0-49) |
| **Focus Keyword** | All, Has Focus Keyword, Missing Focus Keyword |

### SEO Score

Each page receives an SEO score out of 100 based on these criteria:

| Criterion | Points | Condition |
|-----------|--------|-----------|
| **Title length** | 20 | Title is 50-60 characters (10 points if under 70) |
| **Description length** | 20 | Description is 150-160 characters (10 points if under 200) |
| **Focus keyword in title** | 20 | The focus keyword appears in the SEO title |
| **Focus keyword in description** | 15 | The focus keyword appears in the meta description |
| **Focus keyword in URL** | 10 | The focus keyword appears in the page path |
| **OG image** | 10 | An OG image is set |
| **Internal links** | 5 | At least one internal link is configured |

### Per-Page SEO Fields

Click a page row to expand the inline editor with these fields:

| Field | Description | Ideal Length |
|-------|-------------|-------------|
| **SEO Title** | Title tag for search engines | 50-60 characters |
| **Meta Description** | Description shown in search results | 150-160 characters |
| **Focus Keyword** | Primary keyword for this page. Shows green/red check marks for presence in title, description, and URL. | N/A |
| **Meta Keywords** | Comma-separated keywords | N/A |
| **Canonical URL** | The canonical URL for duplicate content resolution | N/A |
| **Robots Directive** | Indexing instruction for search engines | N/A |
| **OG Title** | Title for social media sharing | N/A |
| **OG Description** | Description for social media sharing | N/A |
| **OG Image** | Image for social media sharing | N/A |
| **Internal Links** | List of internal link text/URL pairs for cross-linking | N/A |

**Robots Directive Options:** `index,follow` (default), `noindex,nofollow`, `noindex,follow`, `index,nofollow`

### SERP Preview

A Google search result preview appears within the page editor, showing how the page would appear in search results with the current title, URL, and description.

### AI Optimization

Two AI modes are available:

| Mode | How to Use | What It Does |
|------|-----------|-------------|
| **Single Page** | Click **AI Optimize** on an expanded page | Generates optimized SEO title, meta description, keywords, focus keyword, OG title, and OG description. Shows suggestions for improvement. A **Revert** button appears to undo AI changes before saving. |
| **Bulk AI** | Select multiple pages using checkboxes, then click **AI Optimize Selected** | Generates SEO for all selected pages at once. Review and apply results individually. |

The live SEO score updates in real-time as you edit fields, so you can see the impact of changes before saving.

---

## 7.10 City Pages

Navigate to **Admin** →**Website** →**City Pages** (under the Data group in the sidebar) to manage city-specific landing pages for local SEO.

City landing pages are served at `/areas/{slug}` and help the business rank in search results for each city in the service area.

### City List

The city list shows all configured cities with:
- City name and state
- Slug
- Active/inactive badge
- Distance from the business location
- An expand button to open the editor
- A content blocks button to manage the city page content

### Creating / Editing a City

Click **Add City** or click an existing city to open the editor.

#### City Fields

| Field | Description |
|-------|-------------|
| **City Name** | Name of the city (e.g., "Torrance") |
| **Slug** | URL path segment — auto-generated from the city name (e.g., `torrance`) |
| **State** | Two-letter state abbreviation (default: CA) |
| **Distance** | Miles from the business location |
| **Heading** | Page heading displayed on the city landing page |
| **Intro Text** | Introductory paragraph for the city page |
| **Focus Keywords** | Primary keywords for SEO targeting |
| **Meta Title** | SEO title for the city page |
| **Meta Description** | SEO meta description |
| **Local Landmarks** | Comma-separated list of local landmarks to reference in content |
| **Active** | Toggle to publish or hide the city page |

#### Service Highlights

Each city page can have service highlights — featured services relevant to that specific city:

| Field | Description |
|-------|-------------|
| **Service Name** | Name of the service |
| **Description** | Description tailored to the city |
| **Featured** | Star toggle to feature this service prominently |

Click **Add Highlight** to add a new service highlight. Use the drag handle to reorder. Click the delete button to remove.

Click **Import Services** to automatically populate service highlights from the service catalog.

#### AI Content Generation

Click **AI Generate** on a city entry to have AI create the heading, intro text, and service highlight descriptions based on the city name, distance, and service catalog.

**Batch AI Generation** — Click **Batch Generate** to generate AI content for all cities that are missing content.

#### City Page Content Blocks

Click the content blocks button on a city row to open the content block editor for that city's landing page. This uses the same content block system described in Section 7.2 and Section 7.11.

#### Keyword Density

When a focus keyword is set, the editor shows a keyword density indicator counting the number of times the focus keyword appears in the city page content.

---

## 7.11 Catalog Display

Navigate to **Admin** →**Website** →**Catalog Display** to control which services and products appear on the public website.

### Tabs

The page has two tabs: **Services** and **Products**.

### Services Tab

A table listing all services with these columns:

| Column | Description |
|--------|-------------|
| **Name** | Service name |
| **Category** | Service category |
| **POS Active** | Whether the service is active in the POS (read-only indicator) |
| **Website** | Toggle — controls whether the service appears on the public website |
| **Featured** | Star toggle — featured services appear in prominent positions (e.g., homepage) |

### Products Tab

A table listing all products with these columns:

| Column | Description |
|--------|-------------|
| **Name** | Product name |
| **Category** | Product category |
| **POS Active** | Whether the product is active in the POS (read-only indicator) |
| **Website** | Toggle — controls whether the product appears in the online store |
| **Featured** | Star toggle — featured products appear in prominent positions |

### Bulk Actions

At the top of each tab:
- **Show All on Website** — Enables the website toggle for all items in the current tab
- **Hide All from Website** — Disables the website toggle for all items

---

## 7.12 Global Blocks

Navigate to **Admin** →**Website** →**Global Blocks** to manage shared content blocks that can be reused across multiple pages.

### What Are Global Blocks

Global blocks are content blocks that exist independently of any specific page. When a global block is updated, the change is reflected everywhere it is used. This is useful for content like FAQ sections, CTAs, or credential displays that should be consistent across the site.

### Block Types

Global blocks support all nine content block types:

| Block Type | Description |
|------------|-------------|
| **Rich Text** | Free-form HTML content with the full editor toolbar |
| **FAQ** | Question-and-answer pairs displayed as an accordion. Each FAQ item has a question field and an answer field. Items can be added, removed, and reordered. AI can generate FAQ content. |
| **Features List** | A list of features with title and description for each item. Items can be added, removed, and reordered. |
| **Call to Action** | A CTA section with heading, description, button text, and button URL |
| **Testimonial** | A customer testimonial with quote text, author name, star rating (1-5), and source |
| **Team Grid** | Displays team members from the Team Members table (see Section 7.14). Content is auto-populated. |
| **Credentials** | Displays business credentials from the Credentials table (see Section 7.15). Options include layout (grid), show descriptions toggle, and max items limit. |
| **Terms Sections** | Legal/terms content with an effective date and organized sections. Each section has a title and content body. |
| **Gallery** | An image gallery with uploadable images |

### Creating a Global Block

1. Click **New Block**
2. Enter a **name** for the block
3. Select the **block type** from the dropdown
4. Click **Create**
5. The block appears in the list — expand it to edit its content

### Managing Global Blocks

Each global block in the list shows:
- Block name
- Block type badge (with icon)
- Usage count — how many pages include this block, with page names listed
- **Active/Hidden** toggle
- **Expand** to edit content
- **Delete** — shows a warning if the block is used on any pages

### Inserting a Global Block into a Page

From the page editor's Content Blocks section:
1. Click **Insert Global Block**
2. A dialog shows all available global blocks with their type and name
3. Click a block to add it to the page
4. If the block is already on the page, an error toast prevents duplicate insertion

Global blocks on a page show a special badge to distinguish them from page-scoped blocks. When removing a global block from a page, only the placement is removed — the block itself is not deleted.

---

## 7.13 Ads

Navigate to **Admin** →**Website** →**Ads** to manage advertising placements on the site.

### Master Toggle

A master toggle at the top enables or disables all ads globally. When disabled, no ads are rendered on the site regardless of individual placement settings.

### Tabs

The ads page has three tabs:

#### Creatives Tab

Displays all ad creatives in a grid of cards. Each card shows:
- Thumbnail preview of the creative image
- Creative name
- Size badge (dimensions)
- Performance stats: impressions, clicks, and click-through rate (CTR)

Click **New Creative** to create a new ad. Click an existing creative to edit it.

#### Page Map Tab

Shows every page on the site with its available ad zones. Each page entry lists its zones with:
- Zone name and position
- Currently assigned creative (if any)
- **Assign** button to open the assignment dialog

The assignment dialog lets you select a creative from a dropdown to place in a specific zone on a specific page. Click **Clear** to remove an existing assignment.

#### Analytics Tab

Displays ad performance data with:

| Control | Options |
|---------|---------|
| **Period Selector** | Last 7 days, Last 30 days, Last 90 days, All time |

**Stat Cards:**

| Metric | Description |
|--------|-------------|
| **Total Impressions** | Number of times ads were displayed |
| **Total Clicks** | Number of times ads were clicked |
| **Average CTR** | Click-through rate as a percentage |

**Top Creatives Table:** Lists the best-performing creatives ranked by impressions, with clicks and CTR for each.

---

## 7.14 Team Members

Navigate to **Admin** →**Website** →**Team Members** to manage the team section displayed on the website.

### Team List

Team members are displayed in a list that supports drag-and-drop reordering. Each entry shows the member's photo, name, role, and active status.

### Creating / Editing a Team Member

Click **Add Team Member** or click an existing member to expand their editor.

#### Team Member Fields

| Field | Description |
|-------|-------------|
| **Name** | Full name (required) |
| **Role** | Job title or role (required) |
| **Bio** | Full biography in HTML format. Uses the HTML editor toolbar. Click **AI Generate** to have AI write a bio based on the name and role. |
| **Excerpt** | Short summary for the homepage team section (150 characters recommended) |
| **Photo** | Profile photo (upload) |
| **Years of Service** | Number of years with the company |
| **Certifications** | Tag-style input for certifications (e.g., "IDA Certified", "PPF Specialist"). Type a certification and press Enter to add it as a tag. |
| **Slug** | URL-safe identifier, auto-generated from the name |
| **Active** | Toggle to show or hide the team member on the website |

### Reordering

Drag team members by the grip handle to change their display order on the website.

---

## 7.15 Credentials

Navigate to **Admin** →**Website** →**Credentials** to manage the business certifications, awards, and credentials displayed on the website.

### Credentials List

Credentials are displayed in a list that supports drag-and-drop reordering. Each entry shows the credential title, image/badge, and active status.

### Creating / Editing a Credential

Click **Add Credential** or click an existing credential to expand its editor.

#### Credential Fields

| Field | Description |
|-------|-------------|
| **Title** | Credential name (required) — e.g., "IDA Certified Detailer", "5-Star Google Rating" |
| **Description** | Detailed description in HTML format. Uses the HTML editor toolbar. Click **AI Generate** to have AI write a description based on the title. |
| **Image** | Badge or logo image (upload) |
| **Active** | Toggle to show or hide the credential on the website |

### Reordering

Drag credentials by the grip handle to change their display order on the website.

---

## 7.16 Homepage Settings

Navigate to **Admin** →**Website** →**Homepage** to configure content that appears on the homepage.

### CTA Defaults

The Call-to-Action defaults section controls the CTA block displayed on the homepage:

| Field | Description |
|-------|-------------|
| **Title** | CTA heading text |
| **Description** | CTA body text |
| **Button Text** | CTA button label |
| **Before Image** | Image shown on the left/before side of the CTA |
| **After Image** | Image shown on the right/after side of the CTA |

### Section Content

Controls text content for various homepage sections:

| Field | Description |
|-------|-------------|
| **Services Description (Homepage)** | Introductory text for the services section on the homepage |
| **Services Description (Listing Page)** | Introductory text for the services listing page (`/services`) |
| **Team Section Heading** | Heading for the team members section |
| **Credentials Section Heading** | Heading for the credentials section |

### Differentiators

A list of "Why Choose Us" differentiators displayed on the homepage. Each differentiator has:

| Field | Description |
|-------|-------------|
| **Icon** | Selected from a set of 17 Lucide icons |
| **Title** | Short title (e.g., "Mobile Service") |
| **Description** | Brief description of the differentiator |

Differentiators can be added, removed, and reordered by dragging.

### Google Reviews

| Field | Description |
|-------|-------------|
| **Google Place ID** | The Google Maps Place ID for the business. This enables the Google Reviews widget on the homepage, which automatically pulls and displays recent reviews. |

---

*Previous: [Services & Pricing](./06-services-pricing.md) | Next: [Online Store](./08-online-store.md)*
