"use client";
import { MotionConfig } from "motion/react";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Features } from "./Features";

// The interactive top of the marketing landing page, ported from the Figma
// "Personal tasks dashboard" reference (DECISIONS 4A / D-LANDING-FIGMA): sticky
// nav → full-screen hero → stats bar → how-it-works → features. Each section is
// its own component in this folder. The SEO-critical content that must live in
// the static HTML (metadata, JSON-LD, FAQ, final CTA, footer) is rendered from
// the server in page.tsx.
//
// MotionConfig reducedMotion="user" makes every `motion` element here honor the
// OS "reduce motion" setting automatically (transform/opacity animations resolve
// instantly). The interval-driven demos (kanban loop, counters, feature loops)
// additionally guard on prefers-reduced-motion themselves — see each component.
export function LandingView() {
  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
    </MotionConfig>
  );
}
