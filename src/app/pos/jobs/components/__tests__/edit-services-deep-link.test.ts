import { describe, it, expect } from 'vitest';

/**
 * Item 15f Phase 1 Layer 8d / 8d-bis — Jobs-card Services tile deep-link URL
 * contract.
 *
 * The Services tile in `job-detail.tsx:handleOpenEditServices` builds a
 * `/pos?source=job&id=<JOB_UUID>&returnTo=/pos/jobs?jobId=<JOB_UUID>` URL
 * and `router.push`-es to it. Layer 8b's drain validates the URL params +
 * load endpoint, Layer 8c opens edit mode.
 *
 * Layer 8d (initial): id carried the APPOINTMENT UUID. This 404'd the
 * jobs/checkout-items load endpoint (which expects a job UUID).
 *
 * Layer 8d-bis (Option G4): id is the JOB UUID. The drain calls
 * `/api/pos/jobs/${id}/checkout-items`, then resolves the linked
 * appointment_id from the response and uses that as `ticket.sourceId`.
 * Layer 8c's Save POSTs to `/api/pos/appointments/${sourceId}/services`
 * so the cascade endpoint still receives an appointment UUID — the
 * resolution just happens inside the drain instead of at the URL layer.
 */

function buildJobEditUrl(opts: { jobId: string }): string {
  return `/pos?source=job&id=${opts.jobId}&returnTo=${encodeURIComponent(
    `/pos/jobs?jobId=${opts.jobId}`
  )}`;
}

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Jobs-card edit-services deep-link URL (Layer 8d-bis contract)', () => {
  it('uses source=job (NOT source=appointment) — the drain endpoint discriminator', () => {
    const url = buildJobEditUrl({ jobId: JOB_UUID });
    expect(url).toContain('source=job');
    expect(url).not.toContain('source=appointment');
  });

  it('passes the JOB id (not the appointment id) — load endpoint expects job UUID', () => {
    const url = buildJobEditUrl({ jobId: JOB_UUID });
    expect(url).toContain(`id=${JOB_UUID}`);
    // Defense in depth — make sure the appointment UUID is NOT in the id position.
    // (The drain resolves the appointment UUID from the load-endpoint response
    // and stamps it as `ticket.sourceId` — Option G4.)
    expect(url).not.toMatch(new RegExp(`id=${APPT_UUID}`));
  });

  it('returnTo points to /pos/jobs?jobId=<job_uuid> for queue-with-detail-restore UX', () => {
    const url = buildJobEditUrl({ jobId: JOB_UUID });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('returnTo')).toBe(`/pos/jobs?jobId=${JOB_UUID}`);
  });

  it('returnTo is URL-encoded so embedded ? does not break the outer query string', () => {
    const url = buildJobEditUrl({ jobId: JOB_UUID });
    // The literal '?' inside the returnTo value must be %3F so the outer
    // parser treats source/id/returnTo as the three params, not five.
    expect(url).toContain('returnTo=%2Fpos%2Fjobs%3FjobId%3D');
    // Sanity-check round-trip
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.size).toBe(3);
  });
});
