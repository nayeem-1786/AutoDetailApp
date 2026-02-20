# Smart Details Auto Spa — Post-Launch Roadmap

> Review these items 2-4 weeks after Phase 8 deployment, once real job data exists.

## Priority 1: Marketing Photo Library (Week 2-3)

**Trigger:** Once 50+ jobs have completion photos with some ⭐ featured.

### Marketing → Photo Library Page
- New page under Marketing section in admin sidebar
- Shows all photos where `is_featured = true` across all jobs
- Grid view with filters: date range, vehicle type, staff
- Bulk actions: approve for website, assign category

### Category Tagging System
- New `photo_categories` table with default categories:
  - Interior, Exterior, Ceramic Coating, Paint Correction
  - Headlight Restoration, Hot Shampoo Extraction, Engine Bay, Wheel & Tire
- Assign categories to featured photos from the library page
- Categories used for website portfolio organization

### Before/After Collage Builder
- Select a before (intake) and after (completion) photo pair
- Add title, description, category
- Toggle "Approve for Website"
- Collage is a data record referencing both photo IDs — website renders dynamically
- Auto-detect collage candidates (zones with both intake + completion photos, no collage yet)

## Priority 2: Public Portfolio (Week 3-4)

**Trigger:** Once 20+ collages/featured photos are approved for website.

### Public Portfolio API
- `GET /api/public/portfolio?category=ceramic-coating`
- Returns `photo_collages` where `is_website_approved = true`
- Includes before/after image URLs and metadata
- Website renders as BeforeAfterSliders organized by category

### Public Portfolio Page
- Clean, professional gallery page on the customer-facing site
- Filterable by category
- Each entry shows before/after slider, vehicle info, service performed
- Social sharing meta tags for individual collages

## Priority 3: Vehicle SVG Zone Picker Upgrade (Week 4+)

**Trigger:** When current zone picker UX becomes a bottleneck.

- Purchase professional vehicle blueprint SVGs from Dreamstime (ID: 77465365, $5-12)
- Replace current zone grid with interactive vehicle silhouette
- Tap a zone on the vehicle outline to select it
- Multiple vehicle types: sedan, SUV, truck, van
- Research: check `/mnt/user-data/outputs/PHASE8_JOB_MANAGEMENT.md` sections on zone picker

## Priority 4: Photo Gallery Enhancements (Week 4+)

### Photo Gallery Filters (currently missing)
- Zone dropdown (all 15 zones with friendly labels)
- Vehicle type search (make/model text search)
- Staff dropdown (who took the photo)
- Category filter (once categories exist)
- Date range picker
- "Has before/after pair" toggle

### Auto-Flag Completion Photos
- Every completion photo automatically appears in Marketing review queue
- Removes dependency on detailers manually flagging
- Manager reviews and approves during end-of-day routine

## Priority 5: Additional Enhancements

### Move Photo Gallery Under Marketing
- Once the Marketing photo library exists, move Photo Gallery from standalone sidebar item into the Marketing section
- Rename to "Photo Gallery" or "Media Library"

### Customer Portal: Photo Sharing
- Let customers share their before/after photos via social media
- "Share your results" button on the service detail page
- Pre-formatted with business branding

### Add-On Bundle Discounts
- Admin setting for automatic discount when customer approves 2+ add-ons in one job
- Configurable percentage or fixed amount
- Validate after flag flow has been used on real jobs

---

## Notes
- All deferred features have database support or can be added without breaking changes
- The `is_featured` flag on `job_photos` is already in use via the ⭐ button in job detail
- Review this document at the 2-week mark post-launch and prioritize based on actual usage patterns
- Some items may become unnecessary based on real-world workflow — delete those rather than building them
