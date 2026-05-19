import { describe, it, expect } from 'vitest';

import { dispatchTool } from '@/lib/sms-ai/tool-dispatcher';

describe('dispatchTool (Layer 3a stub)', () => {
  it('returns { isError: true } with the stub message for any tool name', async () => {
    for (const name of [
      'lookup_customer',
      'get_services',
      'classify_vehicle',
      'check_availability',
      'create_appointment',
      'send_info_sms',
      'get_products',
      'get_product_details',
      'notify_staff',
      'send_quote_sms',
      'fictional_tool_xyz',
    ]) {
      const result = await dispatchTool({ name, input: { whatever: true } });
      expect(result.isError).toBe(true);
      expect(typeof result.content).toBe('string');
      expect(result.content).toMatch(/Layer 3b/);
    }
  });
});
