# 3. Job Management

Jobs are the core operational unit in Smart Details Auto Spa. A job represents a single vehicle service session — from the moment work begins on a vehicle through completion, including all documentation, add-on authorizations, and customer notifications.

This chapter covers the full job lifecycle, how to manage jobs from both the Admin dashboard and the POS, photo documentation, the add-on authorization flow, and how jobs connect to appointments.

---

## 3.1 What Is a Job?

A job is created when a vehicle is checked in for service. Every job tracks:

- **Customer** and **vehicle** being serviced
- **Services** performed (original booking + any add-ons)
- **Assigned detailer** performing the work
- **Photos** documenting before, during, and after states
- **Timer** tracking active work duration
- **Status** representing where the job is in its lifecycle
- **Financial totals** — service subtotal, add-on costs, discounts, tax, and final total

Jobs can originate from:

1. **Online bookings** — Customer books through the website; appointment is confirmed; job is created at check-in
2. **Walk-ins** — Staff creates the job directly in the POS when a customer arrives without a booking
3. **Quote conversions** — An accepted quote is converted into a job through the POS

---

## 3.2 Job Statuses

Every job has a status that reflects its current stage. The status drives what actions are available and what the POS interface displays.

| Status | Meaning | Who Sets It |
|--------|---------|-------------|
| `scheduled` | Job created, waiting for vehicle arrival | System (on creation) |
| `intake` | Vehicle has arrived; intake documentation in progress | Detailer (starts intake) |
| `in_progress` | Active work underway; timer is running | Detailer (starts work after intake) |
| `pending_approval` | Work complete; awaiting customer approval (reserved for future use) | — |
| `completed` | All work finished; customer notified | Detailer (completes job) |
| `closed` | Job fully settled and archived | System or admin |
| `cancelled` | Job was cancelled before completion | Staff (cancels job) |

### Terminal Statuses

Jobs in **completed**, **closed**, or **cancelled** status are considered terminal. Terminal jobs:

- Cannot be edited (customer, vehicle, services are locked)
- Cannot have their status changed
- Still appear in history and reports

---

## 3.3 Job Lifecycle

A typical job flows through these stages:

```
scheduled → intake → in_progress → completed → closed
```

### Step 1: Job Creation

Jobs are created in the POS via one of these paths:

- **From an appointment** — When a customer with a confirmed booking arrives, staff creates a job linked to that appointment
- **Walk-in** — Staff creates a new job directly, selecting the customer, vehicle, and services
- **From a quote** — An accepted quote is converted to a job, carrying over services and pricing

On creation, the system automatically assigns an available detailer if one is not specified. The job starts in **scheduled** status.

### Step 2: Intake

When the vehicle arrives, the detailer begins the intake process:

1. Photographs the vehicle's current condition (intake photos)
2. Documents any existing damage or notable conditions
3. Records intake notes

The intake phase uses the zone-based photo system (see [Section 3.6](#36-photo-documentation)) to ensure comprehensive documentation. Once all intake photos are captured and notes recorded, the intake is marked complete (`intake_completed_at` is set).

### Step 3: Start Work

After intake is complete, the detailer starts work:

- Status changes from `intake` to `in_progress`
- The work timer begins (`work_started_at` is recorded)
- The job appears as "In Progress" across all interfaces

> Intake must be completed before work can start. The system enforces this — attempting to start work without completing intake will be rejected.

### Step 4: Work in Progress

While work is underway:

- The timer tracks elapsed time
- Progress photos can be captured
- **Add-on services** can be proposed if additional work is discovered (see [Section 3.7](#37-add-on-authorization))
- The detailer can pause and resume the timer as needed

### Step 5: Completion

When all services are finished, the detailer completes the job:

1. Completion photos are captured (documenting the finished state)
2. Pickup notes are optionally added (e.g., "Keys are in the cupholder")
3. The detailer marks the job complete

On completion, the system automatically:

- Stops the work timer and records final `timer_seconds`
- Generates a **gallery token** — a unique link the customer can use to view their before/after photos
- Selects **featured photos** — automatically picks the first exterior and interior before/after pairs
- Sends a **completion SMS** to the customer with a short link to their photo gallery
- Sends a **completion email** with inline before/after photo pairs

### Step 6: Closing

After completion, the job may be closed once all financial matters are settled (payment processed, any refunds handled). Closing is the final state.

### Cancellation

Jobs can be cancelled at various stages with different permission requirements:

| Job Status | Who Can Cancel | Permission Required |
|------------|---------------|-------------------|
| `scheduled` or `intake` | Any staff with cancel permission | `pos.jobs.cancel` |
| `in_progress` or `pending_approval` | Admin-level roles only | Admin role required |

When a job is cancelled:

- If linked to an appointment, the appointment is also cancelled
- Optionally sends cancellation notification (SMS, email, or both) to the customer
- The cancellation reason and timestamp are recorded

---

## 3.4 Managing Jobs in Admin

The admin interface provides a read-only view of all jobs with powerful filtering and search capabilities.

### Jobs List Page

Navigate to **Admin** → **Jobs** to see all jobs.

#### Columns

| Column | What It Shows |
|--------|--------------|
| **Date** | Scheduled or creation date |
| **Customer** | Customer name (linked to customer profile) |
| **Vehicle** | Year, make, model |
| **Services** | Comma-separated service names |
| **Add-ons** | Count of approved add-on services |
| **Photos** | Total photo count for the job |
| **Duration** | Work timer duration (formatted as hours:minutes) |
| **Staff** | Assigned detailer name |
| **Status** | Color-coded status badge |

#### Filters

| Filter | Options |
|--------|---------|
| **Search** | Customer name or phone number |
| **Status** | Scheduled, Intake, In Progress, Completed, Closed, Cancelled |
| **Staff** | Filter by assigned detailer |
| **Date range** | Start date and end date |

#### Sorting

Click column headers to sort by:

- Date (default, newest first)
- Duration
- Status

Results are paginated at 20 items per page.

### Job Detail Page

Click any job in the list to view its full detail. The detail page has two tabs: **Overview** and **Photos**.

#### Overview Tab

The overview tab is organized into a main content area and a sidebar:

**Main Content:**

| Section | What It Contains |
|---------|-----------------|
| **Job Summary** | Customer name, vehicle, assigned staff, and work duration |
| **Timeline** | Chronological list of key events — created, intake started, intake completed, work started, completed, pickup/closed, or cancelled |
| **Original Services** | Services from the original booking with individual prices and a subtotal |
| **Add-ons** | Any add-on services with their status (Approved, Declined, Pending, Expired) and pricing |
| **Pickup Notes** | Notes left by the detailer for vehicle pickup |
| **Cancellation** | If cancelled — reason, timestamp, who cancelled it |

**Sidebar:**

| Card | What It Shows |
|------|--------------|
| **Totals** | Subtotal, add-on total, discount, tax, and grand total |
| **Quick Stats** | Photo count, work duration, number of services, number of add-ons |
| **Intake Notes** | Notes recorded during vehicle intake |

#### Photos Tab

The photos tab displays all job photos organized by phase:

- **Intake** — Before photos taken during vehicle check-in
- **Progress** — Photos taken during the work process
- **Completion** — After photos taken when work is finished

Photos are grouped by zone (e.g., "Exterior — Front", "Interior — Dashboard"). Where both intake and completion photos exist for the same zone, a **before/after slider** is displayed for easy comparison.

Each photo shows:

- The photo itself (clickable to open in a lightbox)
- Zone label
- Phase label
- A **featured star** toggle — marks the photo pair for use in the public gallery and marketing

---

## 3.5 Managing Jobs in POS

The POS is where detailers and staff actively manage jobs throughout the day. The POS Jobs tab provides a focused view of today's work.

### Today's Jobs View

The POS shows jobs filtered to today (PST timezone) with three filter options:

| Filter | Shows |
|--------|-------|
| **My Jobs** | Jobs assigned to the logged-in staff member |
| **All** | All jobs for today |
| **Unassigned** | Jobs with no assigned detailer |

Each job card shows the customer name, vehicle, services, status badge, and assigned detailer.

### Creating a Walk-In Job

To create a job for a walk-in customer:

1. Tap **New Job** in the POS Jobs tab
2. Select or create the customer
3. Select or add a vehicle
4. Choose services
5. Add intake notes if needed
6. Tap **Create Job**

The system automatically assigns an available detailer based on current workload and schedule. The job is created in **scheduled** status.

> Creating a job requires the `pos.jobs.manage` permission.

### Job Workflow in POS

From the POS job detail view, staff can:

| Action | When Available | What Happens |
|--------|---------------|-------------|
| **Start Intake** | Job is in `scheduled` status | Opens the intake photo capture interface |
| **Complete Intake** | Intake photos are captured | Records `intake_completed_at` |
| **Start Work** | Intake is complete | Transitions to `in_progress`, starts timer |
| **Capture Photos** | Job is `in_progress` | Opens photo capture for progress/completion |
| **Propose Add-on** | Job is `in_progress` | Creates an add-on authorization request |
| **Complete Job** | Job is `in_progress` | Stops timer, sends notifications, generates gallery link |
| **Cancel Job** | Job is not terminal | Cancels the job (permission-dependent) |

### Editing Job Details

While a job is in a non-terminal status, staff with `pos.jobs.manage` permission can edit:

- **Customer** — Reassign the job to a different customer
- **Vehicle** — Change the associated vehicle
- **Services** — Modify the service list
- **Intake notes** — Update intake documentation

Workflow fields (status, assigned staff, timer values, pickup notes) can be updated by any staff member working on the job.

---

## 3.6 Photo Documentation

Photos are a critical part of every job. They serve three purposes:

1. **Liability protection** — Intake photos document pre-existing conditions
2. **Quality proof** — Before/after pairs demonstrate the work performed
3. **Marketing** — Featured photos feed the public gallery and social media

### Photo Zones

Every photo is tagged with a **zone** indicating which part of the vehicle it documents:

#### Exterior Zones (8)

| Zone | Label |
|------|-------|
| `exterior_front` | Front |
| `exterior_rear` | Rear |
| `exterior_driver_side` | Driver Side |
| `exterior_passenger_side` | Passenger Side |
| `exterior_hood` | Hood |
| `exterior_roof` | Roof |
| `exterior_trunk` | Trunk |
| `exterior_wheels` | Wheels |

#### Interior Zones (7)

| Zone | Label |
|------|-------|
| `interior_dashboard` | Dashboard |
| `interior_console` | Console |
| `interior_seats_front` | Front Seats |
| `interior_seats_rear` | Rear Seats |
| `interior_carpet` | Carpet |
| `interior_door_panels` | Door Panels |
| `interior_trunk_cargo` | Trunk / Cargo |

### Photo Phases

Each photo belongs to one of three phases:

| Phase | When Captured | Purpose |
|-------|--------------|---------|
| **Intake** | During vehicle check-in | Document pre-existing condition ("before") |
| **Progress** | During active work | Document work in progress |
| **Completion** | After work is finished | Document final result ("after") |

### Before/After Pairing

The system automatically pairs intake and completion photos by zone. If a job has an intake photo for `exterior_front` and a completion photo for `exterior_front`, they form a before/after pair. These pairs are used in:

- The job detail photos tab (admin)
- The customer photo gallery
- The completion email sent to the customer
- The public photo gallery (when featured)

### Featured Photos

Photos can be marked as "featured" to appear in the public gallery. Featured status is set at the **pair level** — both the intake and completion photos for a zone must exist before the pair can be featured.

Featured photos are managed from:

- **Admin** → **Jobs** → job detail → **Photos** tab (per-job starring)
- **Admin** → **Photos** (bulk management across all jobs)

---

## 3.7 Add-On Authorization

When a detailer discovers additional work needed during a job (e.g., a stain requiring special treatment, a scratch that could be polished out), they can propose an **add-on service** to the customer for approval.

### How It Works

1. **Detailer proposes add-on** — From the POS job detail, the detailer:
   - Selects the add-on service or product
   - Describes the issue found
   - Optionally attaches inspection photos with annotations
   - Sets the price

2. **System sends authorization request** — The system sends both:
   - **SMS** with a link to the authorization page
   - **Email** with details and a link

3. **Customer reviews and decides** — The customer visits the authorization page (`/authorize/[token]`) which shows:
   - A conversational message explaining what was found
   - Inspection photos with annotations (if provided)
   - The proposed service and pricing
   - The updated ticket total
   - **Approve** and **Decline** buttons

4. **Authorization expires** — If the customer doesn't respond within the configured timeout (default: 30 minutes), the add-on automatically expires

### Authorization Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Awaiting customer response |
| `approved` | Customer approved the add-on; service will be performed |
| `declined` | Customer declined the add-on |
| `expired` | Customer did not respond before the timeout |

### Issue Types

Add-on proposals include an issue type to help the customer understand the context:

- Stain or spot requiring treatment
- Scratch or swirl that could be addressed
- Odor requiring special treatment
- Damage found during inspection
- Other / general recommendation

> The authorization page is designed to be customer-friendly — it uses conversational language rather than technical terminology, and clearly shows what the customer is approving.

---

## 3.8 Customer Photo Gallery

When a job is completed, the system generates a **gallery token** — a unique URL that the customer can use to view their service photos.

### How Customers Access It

- **Via SMS** — The completion text includes a short link
- **Via email** — The completion email includes a "View Your Photos" link
- **Via the customer portal** — Photos appear in the customer's service history

### What the Gallery Shows

The customer gallery page (`/jobs/[token]/photos`) displays:

- **Vehicle information** — Year, make, model
- **Completion date**
- **Services performed** — Including any approved add-ons
- **Photos by zone** — Grouped by vehicle zone with before/after sliders where both phases exist

> The customer gallery only shows non-internal photos. Photos marked as internal are excluded. The page uses `noindex`/`nofollow` meta tags to prevent search engine indexing.

---

## 3.9 Vehicle Categories & Pricing

Jobs involve vehicles, and vehicle type affects service pricing. The system supports five vehicle categories:

| Category | Examples | Pricing Model |
|----------|---------|--------------|
| **Automobile** | Cars, trucks, SUVs | Based on size class (sedan, truck/SUV 2-row, SUV 3-row/van) |
| **Motorcycle** | Cruisers, touring bikes | Specialty tier (standard cruiser, touring bagger) |
| **RV** | Motorhomes, campers | Specialty tier (based on length) |
| **Boat** | Speedboats, yachts | Specialty tier (based on length) |
| **Aircraft** | Small planes, jets | Specialty tier (based on class) |

### How Vehicle Type Affects Jobs

When a job is created, the vehicle's category and size/tier determine which pricing tier applies to each service. For automobiles, the `vehicle_type` and `size_class` fields drive pricing. For specialty categories (motorcycle, RV, boat, aircraft), the `specialty_tier` field maps to service pricing tiers.

> Vehicle category constants are defined in `src/lib/utils/vehicle-categories.ts`. See [Chapter 6: Services & Pricing](./06-services-pricing.md) for details on how pricing tiers work.

---

## 3.10 Jobs and Appointments

Jobs and appointments are closely linked but serve different purposes:

| Concept | Purpose | Created By |
|---------|---------|-----------|
| **Appointment** | Scheduled time slot for a customer | Online booking or admin |
| **Job** | Active work record for a vehicle | POS at check-in |

### How They Connect

- An appointment exists before the customer arrives (scheduling)
- A job is created when the customer checks in (execution)
- The job is linked to the appointment via `appointment_id`
- If a job is cancelled, the linked appointment is also cancelled

### Walk-In Jobs

Walk-in jobs have no linked appointment. They are created directly in the POS without a prior booking.

---

## 3.11 Permissions Reference

| Permission | What It Controls |
|------------|-----------------|
| `pos.jobs.view` | View job cards in POS |
| `pos.jobs.manage` | Create jobs, start work, complete jobs, edit job details |
| `pos.jobs.flag_issue` | Flag issues on a job (damage, customer complaint) |
| `pos.jobs.cancel` | Cancel jobs in `scheduled` or `intake` status |
| `admin.photos.view` | View the admin photos page |
| `admin.photos.manage` | Manage photo tags and featured status |

> Cancelling a job that is already `in_progress` or `pending_approval` requires an admin-level role, regardless of individual permissions.

---

*Previous: [Dashboard](./02-dashboard.md) | Next: [Point of Sale (POS)](./04-pos.md)*
