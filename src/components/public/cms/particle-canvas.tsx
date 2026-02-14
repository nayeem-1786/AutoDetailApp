'use client';

import { useEffect, useRef } from 'react';
import type { ParticleEffect } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// ParticleCanvas — Canvas-based particle rendering
// Fixed overlay with pointer-events: none
// Respects prefers-reduced-motion and Page Visibility API
// ---------------------------------------------------------------------------

interface ParticleCanvasProps {
  effect: ParticleEffect;
  intensity?: number;
  color?: string | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
}

// Default colors for multi-color effects
const FIREWORK_COLORS = ['#ef4444', '#3b82f6', '#fbbf24', '#22c55e', '#a855f7', '#ec4899'];
const CONFETTI_COLORS = ['#ef4444', '#3b82f6', '#fbbf24', '#22c55e', '#a855f7', '#ec4899', '#f97316'];

export function ParticleCanvas({ effect, intensity = 50, color }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    // Respect reduced motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reduce particle count on mobile
    const isMobile = window.innerWidth < 768;
    const particleCount = Math.floor(intensity * (isMobile ? 0.5 : 1));

    let particles: Particle[] = [];
    let paused = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Page visibility
    const handleVisibility = () => {
      paused = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Create a particle based on effect type
    const createParticle = (): Particle => {
      const w = canvas.width;
      const h = canvas.height;
      const baseColor = color ?? '#ffffff';

      switch (effect) {
        case 'snowfall':
          return {
            x: Math.random() * w,
            y: -10,
            vx: (Math.random() - 0.5) * 0.5,
            vy: 0.5 + Math.random() * 1.5,
            size: 2 + Math.random() * 4,
            opacity: 0.3 + Math.random() * 0.7,
            color: baseColor,
            rotation: 0,
            rotationSpeed: 0,
            life: 0,
            maxLife: h / 0.5 + 200,
          };

        case 'fireworks': {
          const cx = Math.random() * w;
          const cy = h * 0.2 + Math.random() * h * 0.4;
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 3;
          const c = color ?? FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
          return {
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2 + Math.random() * 2,
            opacity: 1,
            color: c,
            rotation: 0, rotationSpeed: 0,
            life: 0, maxLife: 60 + Math.random() * 40,
          };
        }

        case 'confetti': {
          const c = color ?? CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
          return {
            x: Math.random() * w,
            y: -10,
            vx: (Math.random() - 0.5) * 2,
            vy: 1 + Math.random() * 2,
            size: 4 + Math.random() * 4,
            opacity: 0.8 + Math.random() * 0.2,
            color: c,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
            life: 0, maxLife: h / 1 + 200,
          };
        }

        case 'hearts':
          return {
            x: Math.random() * w,
            y: h + 10,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -(0.5 + Math.random() * 1.5),
            size: 6 + Math.random() * 8,
            opacity: 0.4 + Math.random() * 0.6,
            color: baseColor,
            rotation: 0, rotationSpeed: 0,
            life: 0, maxLife: h / 0.5 + 200,
          };

        case 'leaves':
          return {
            x: Math.random() * w,
            y: -10,
            vx: 0.5 + Math.random() * 1,
            vy: 0.5 + Math.random() * 1,
            size: 6 + Math.random() * 6,
            opacity: 0.5 + Math.random() * 0.5,
            color: baseColor,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.05,
            life: 0, maxLife: h / 0.5 + 200,
          };

        case 'stars':
          return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: 0, vy: 0,
            size: 1 + Math.random() * 3,
            opacity: Math.random(),
            color: baseColor,
            rotation: 0, rotationSpeed: 0,
            life: 0, maxLife: 120 + Math.random() * 120,
          };

        case 'sparkles':
          return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: 1 + Math.random() * 3,
            opacity: 0,
            color: baseColor,
            rotation: 0, rotationSpeed: 0,
            life: 0, maxLife: 60 + Math.random() * 60,
          };

        default:
          return {
            x: Math.random() * w, y: -10,
            vx: 0, vy: 1, size: 2, opacity: 1,
            color: baseColor, rotation: 0, rotationSpeed: 0,
            life: 0, maxLife: 200,
          };
      }
    };

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      const p = createParticle();
      // Spread initial positions so they don't all start at the same spot
      p.life = Math.random() * p.maxLife;
      if (effect === 'snowfall' || effect === 'confetti' || effect === 'leaves') {
        p.y = Math.random() * canvas.height;
      }
      particles.push(p);
    }

    // Draw functions
    const drawHeart = (x: number, y: number, size: number) => {
      ctx.beginPath();
      const s = size / 2;
      ctx.moveTo(x, y + s * 0.3);
      ctx.bezierCurveTo(x, y - s * 0.5, x - s, y - s * 0.5, x - s, y + s * 0.1);
      ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s, x, y + s);
      ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.6, x + s, y + s * 0.1);
      ctx.bezierCurveTo(x + s, y - s * 0.5, x, y - s * 0.5, x, y + s * 0.3);
      ctx.closePath();
      ctx.fill();
    };

    const drawLeaf = (x: number, y: number, size: number, rotation: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, size / 2, size / 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Animation loop
    const animate = () => {
      if (paused) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // Effect-specific behavior
        switch (effect) {
          case 'snowfall':
            p.vx += (Math.random() - 0.5) * 0.02;
            break;
          case 'fireworks':
            p.vy += 0.02; // gravity
            p.opacity = Math.max(0, 1 - p.life / p.maxLife);
            break;
          case 'stars':
            p.opacity = 0.5 + 0.5 * Math.sin(p.life * 0.05);
            break;
          case 'sparkles':
            p.opacity = Math.sin((p.life / p.maxLife) * Math.PI);
            break;
          case 'leaves':
            p.vx += Math.sin(p.life * 0.02) * 0.02;
            break;
        }

        // Draw
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (effect === 'hearts') {
          drawHeart(p.x, p.y, p.size);
        } else if (effect === 'leaves') {
          drawLeaf(p.x, p.y, p.size, p.rotation);
        } else if (effect === 'confetti') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

        // Recycle particle
        if (p.life >= p.maxLife ||
            p.y > canvas.height + 20 ||
            p.y < -20 ||
            p.x < -20 ||
            p.x > canvas.width + 20) {
          particles[i] = createParticle();
        }
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      particles = [];
    };
  }, [effect, intensity, color]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
    />
  );
}
