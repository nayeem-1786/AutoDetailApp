import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // First try to get IP from proxy headers (works in production)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    // Skip localhost/private IPs - fetch public IP instead
    if (!isPrivateIp(ip)) {
      return NextResponse.json({ ip });
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && !isPrivateIp(realIp)) {
    return NextResponse.json({ ip: realIp });
  }

  // In development or when behind localhost, fetch public IP from external service
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ ip: data.ip });
    }
  } catch {
    // Fall through
  }

  return NextResponse.json({ ip: 'unknown' });
}

function isPrivateIp(ip: string): boolean {
  // Check for localhost and private IP ranges
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;

  // 10.x.x.x
  if (ip.startsWith('10.')) return true;

  // 172.16.x.x - 172.31.x.x
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // 192.168.x.x
  if (ip.startsWith('192.168.')) return true;

  return false;
}
