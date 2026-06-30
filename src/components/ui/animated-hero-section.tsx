"use client";

// AgentBoardPixelHero — a CONTAINED, decorative pixel-Pong canvas that spells
// "AGENTBOARD" and plays a calm game of Pong against the letters, recolored to
// AgentBoard's warm operator-console palette. Adapted from the open-source
// "PromptingIsAllYouNeed" pixel-Pong canvas.
//
// Design constraints (see CLAUDE.md):
//   - Sized to its PARENT container (ResizeObserver), never window.innerWidth/Height.
//   - aria-hidden: purely decorative; the real <h1> remains the accessible heading.
//   - prefers-reduced-motion: renders a single static frame, no rAF loop.
//   - Colors pulled from the globals.css token values (paper / ink / line / orange).

import { useEffect, useRef } from "react";

// ── Palette (matches src/app/globals.css tokens) ─────────────────────────────
// Background is intentionally NOT painted: we clear transparent so the section's
// --paper (#f0ece6) surface shows through. Remaining tokens drive the artwork.
const COLOR_INK = "#1a1714"; // --ink   : unhit pixels (the lettering)
const COLOR_HIT = "#cdc4b8"; // --line  : pixels the ball has cleared (muted)
const COLOR_ACCENT = "#e84500"; // --orange: ball + paddles

interface Pixel {
  x: number;
  y: number;
  size: number;
  hit: boolean;
}

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  targetY: number;
}

// 5-row pixel font. Each glyph is rows of "1"/"0" strings. SPACE handled below.
// Original map was missing "B"; a 5-row B has been added. A,G,E,N,T,O,R,D verified
// present, plus the letters needed for the small "MCP CONTROL PLANE" line.
const PIXEL_MAP: { [key: string]: string[] } = {
  A: ["111", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"], // ADDED — was missing from the source map
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "111", "100", "111"],
  G: ["111", "100", "101", "101", "111"],
  L: ["100", "100", "100", "100", "111"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  N: ["1001", "1101", "1011", "1001", "1001"],
  O: ["111", "101", "101", "101", "111"],
  P: ["111", "101", "111", "100", "100"],
  R: ["110", "101", "110", "101", "101"],
  T: ["111", "010", "010", "010", "010"],
  " ": ["00", "00", "00", "00", "00"],
};

export function AgentBoardPixelHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let pixels: Pixel[] = [];
    let balls: Ball[] = [];
    const paddles: { left: Paddle; right: Paddle } = {
      left: { x: 0, y: 0, width: 0, height: 0, targetY: 0 },
      right: { x: 0, y: 0, width: 0, height: 0, targetY: 0 },
    };
    let pixelSize = 0;
    let animationFrameId: number | null = null;

    // Lay out the lettering + game elements based on the CONTAINER size.
    const setup = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, rect.width);
      const cssHeight = Math.max(1, rect.height);

      // Backing store at devicePixelRatio for crisp pixels; CSS size = container.
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = cssWidth;
      const height = cssHeight;

      pixels = [];
      pixelSize = Math.max(2, Math.round(width / 110));

      const calcWordWidth = (word: string, scale: number) =>
        word.split("").reduce((acc, ch) => {
          const glyph = PIXEL_MAP[ch] || PIXEL_MAP[" "];
          return acc + glyph[0].length * scale + scale; // glyph + 1-col gap
        }, 0);

      const drawWord = (
        word: string,
        startX: number,
        startY: number,
        scale: number,
      ) => {
        let cursorX = startX;
        word.split("").forEach((ch) => {
          const glyph = PIXEL_MAP[ch] || PIXEL_MAP[" "];
          glyph.forEach((row, rowIdx) => {
            row.split("").forEach((cell, colIdx) => {
              if (cell === "1") {
                pixels.push({
                  x: cursorX + colIdx * scale,
                  y: startY + rowIdx * scale,
                  size: scale,
                  hit: false,
                });
              }
            });
          });
          cursorX += (glyph[0].length + 1) * scale; // advance + gap
        });
      };

      // Big word: scale it to ~78% of the container width.
      const bigWord = "AGENTBOARD";
      let bigScale = pixelSize * 2;
      let bigWidth = calcWordWidth(bigWord, bigScale);
      const maxBig = width * 0.82;
      if (bigWidth > maxBig) {
        bigScale = Math.max(2, Math.floor(bigScale * (maxBig / bigWidth)));
        bigWidth = calcWordWidth(bigWord, bigScale);
      }
      const bigHeight = 5 * bigScale;

      // Small word underneath.
      const smallWord = "MCP CONTROL PLANE";
      let smallScale = Math.max(2, Math.round(bigScale / 2.6));
      let smallWidth = calcWordWidth(smallWord, smallScale);
      const maxSmall = width * 0.7;
      if (smallWidth > maxSmall) {
        smallScale = Math.max(1, Math.floor(smallScale * (maxSmall / smallWidth)));
        smallWidth = calcWordWidth(smallWord, smallScale);
      }
      const smallHeight = 5 * smallScale;

      const gap = bigScale * 2.2;
      const blockHeight = bigHeight + gap + smallHeight;
      const topY = (height - blockHeight) / 2;

      drawWord(bigWord, (width - bigWidth) / 2, topY, bigScale);
      drawWord(
        smallWord,
        (width - smallWidth) / 2,
        topY + bigHeight + gap,
        smallScale,
      );

      // Paddles hug the vertical edges.
      const paddleW = Math.max(4, Math.round(width / 110));
      const paddleH = Math.max(30, Math.round(height / 4));
      paddles.left = {
        x: paddleW * 2,
        y: height / 2 - paddleH / 2,
        width: paddleW,
        height: paddleH,
        targetY: height / 2 - paddleH / 2,
      };
      paddles.right = {
        x: width - paddleW * 3,
        y: height / 2 - paddleH / 2,
        width: paddleW,
        height: paddleH,
        targetY: height / 2 - paddleH / 2,
      };

      // A couple of balls keep the field lively without being noisy.
      const ballRadius = Math.max(3, Math.round(pixelSize * 1.2));
      const speed = Math.max(2, width / 320);
      balls = [
        {
          x: width / 2,
          y: height / 2,
          dx: speed,
          dy: speed * 0.6,
          radius: ballRadius,
        },
        {
          x: width / 2,
          y: height / 3,
          dx: -speed * 0.8,
          dy: speed,
          radius: ballRadius,
        },
      ];
    };

    const drawScene = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      // Transparent clear so the section's paper surface shows through.
      ctx.clearRect(0, 0, width, height);

      // Lettering.
      pixels.forEach((p) => {
        ctx.fillStyle = p.hit ? COLOR_HIT : COLOR_INK;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });

      // Paddles.
      ctx.fillStyle = COLOR_ACCENT;
      ctx.fillRect(
        paddles.left.x,
        paddles.left.y,
        paddles.left.width,
        paddles.left.height,
      );
      ctx.fillRect(
        paddles.right.x,
        paddles.right.y,
        paddles.right.width,
        paddles.right.height,
      );

      // Balls.
      balls.forEach((ball) => {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_ACCENT;
        ctx.fill();
      });
    };

    const update = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      balls.forEach((ball) => {
        ball.x += ball.dx;
        ball.y += ball.dy;

        // Bounce off top/bottom walls.
        if (ball.y - ball.radius < 0 || ball.y + ball.radius > height) {
          ball.dy = -ball.dy;
          ball.y = Math.max(ball.radius, Math.min(height - ball.radius, ball.y));
        }
        // Bounce off left/right walls.
        if (ball.x - ball.radius < 0 || ball.x + ball.radius > width) {
          ball.dx = -ball.dx;
          ball.x = Math.max(ball.radius, Math.min(width - ball.radius, ball.x));
        }

        // Paddle collisions.
        const hitPaddle = (paddle: Paddle) =>
          ball.x - ball.radius < paddle.x + paddle.width &&
          ball.x + ball.radius > paddle.x &&
          ball.y > paddle.y &&
          ball.y < paddle.y + paddle.height;

        if (hitPaddle(paddles.left) && ball.dx < 0) ball.dx = -ball.dx;
        if (hitPaddle(paddles.right) && ball.dx > 0) ball.dx = -ball.dx;

        // Clear pixels the ball touches.
        pixels.forEach((p) => {
          if (
            !p.hit &&
            ball.x + ball.radius > p.x &&
            ball.x - ball.radius < p.x + p.size &&
            ball.y + ball.radius > p.y &&
            ball.y - ball.radius < p.y + p.size
          ) {
            p.hit = true;
          }
        });
      });

      // Paddles track the nearest ball on their side.
      const trackBall = (paddle: Paddle, isLeft: boolean) => {
        let nearest = balls[0];
        let bestDist = Infinity;
        balls.forEach((b) => {
          const movingToward = isLeft ? b.dx < 0 : b.dx > 0;
          const dist = Math.abs(b.x - paddle.x);
          if (movingToward && dist < bestDist) {
            bestDist = dist;
            nearest = b;
          }
        });
        paddle.targetY = nearest.y - paddle.height / 2;
        paddle.y += (paddle.targetY - paddle.y) * 0.08;
        paddle.y = Math.max(0, Math.min(height - paddle.height, paddle.y));
      };
      trackBall(paddles.left, true);
      trackBall(paddles.right, false);

      // When every pixel is cleared, reset the lettering for a fresh round.
      if (pixels.length > 0 && pixels.every((p) => p.hit)) {
        pixels.forEach((p) => {
          p.hit = false;
        });
      }
    };

    const loop = () => {
      update();
      drawScene();
      animationFrameId = requestAnimationFrame(loop);
    };

    setup();
    if (prefersReducedMotion) {
      // Static first frame only — no animation loop.
      drawScene();
    } else {
      loop();
    }

    const resizeObserver = new ResizeObserver(() => {
      setup();
      drawScene();
    });
    resizeObserver.observe(container);

    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="relative h-full w-full overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  );
}
