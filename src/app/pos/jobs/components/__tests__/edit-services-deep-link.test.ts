import { describe, it, expect } from 'vitest';

/**
 * Item 15f Phase 1 Layer 8d — Jobs-card Services tile deep-link URL contract.
 *
 * The Services tile in `job-detail.tsx:handleOpenEditServices` builds a
 * `/pos?source=job&id=<APPOINTMENT_UUID>&returnTo=/pos/jobs?jobId=<JOB_UUID>`
 * URL and `router.push`-es to it. Layer 8b's drain validates the URL params
 * + load endpoint, Layer 8c opens edit mode.
 *
 * This test pins the URL format contract — specifically the
 * id=appointment_id / returnTo=jobs?jobId mapping — without mounting the
 * 2000-line JobDetail component. The encoding is the entire contract;
 * the click handler is a one-line `router.push(...)` around it.
 *
 * Critical invariant: `id` must be the APPOINTMENT UUID, not the job UUID.
 * Layer 8c's Save handler POSTs to
 * `/api/pos/appointments/${sourceId}/services` unconditionally; passing the
 * job id would 404 the cascade. Source-side affordances own the appointment-
 * id resolution.
 */

function buildJobEditUrl(opts: { appointmentId: string; jobId: string }): string {
  return `/pos?source=job&id=${opts.appointmentId}&returnTo=${encodeURIComponent(
    `/pos/jobs?jobId=${opts.jobId}`
  )}`;
}

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Jobs-card edit-services deep-link URL (Layer 8d contract)', () => {
  it('uses source=job (NOT source=appointment) — the drain endpoint discriminator', () => {
    const url = buildJobEditUrl({ appointmentId: APPT_UUID, jobId: JOB_UUID });
    expect(url).toContain('source=job');
    expect(url).not.toContain('source=appointment');
  });

  it('passes the APPOINTMENT id, not the job id (Layer 8c save target)', () => {
    const url = buildJobEditUrl({ appointmentId: APPT_UUID, jobId: JOB_UUID });
    expect(url).toContain(`id=${APPT_UUID}`);
    // Defense in depth — make sure the job UUID is NOT in the id position.
    expect(url).not.toMatch(new RegExp(`id=${JOB_UUID}`));
  });

  it('returnTo points to /pos/jobs?jobId=<job_uuid> for queue-with-detail-restore UX', () => {
    const url = buildJobEditUrl({ appointmentId: APPT_UUID, jobId: JOB_UUID });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('returnTo')).toBe(`/pos/jobs?jobId=${JOB_UUID}`);
  });

  it('returnTo is URL-encoded so embedded ? does not break the outer query string', () => {
    const url = buildJobEditUrl({ appointmentId: APPT_UUID, jobId: JOB_UUID });
    // The literal '?' inside the returnTo value must be %3F so the outer
    // parser treats source/id/returnTo as the three params, not five.
    expect(url).toContain('returnTo=%2Fpos%2Fjobs%3FjobId%3D');
    // Sanity-check round-trip
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.size).toBe(3);
  });
});
