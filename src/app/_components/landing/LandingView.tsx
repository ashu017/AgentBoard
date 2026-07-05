import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { StatsBar } from "./StatsBar";
import { HowItWorks } from "./HowItWorks";
import { Features } from "./Features";

// The interactive top of the marketing landing page, ported from the Figma
// "Personal tasks dashboard" reference (DECISIONS 4A / D-LANDING-FIGMA): sticky
// nav → full-screen hero → stats bar → how-it-works → features. Each section is
// its own component in this folder. The SEO-critical content that must live in
// the static HTML (metadata, JSON-LD, FAQ, final CTA, footer) is rendered from
// the server in page.tsx.
export function LandingView() {
  return (
    <>
      <Nav />
      <Hero />
      <StatsBar />
      <HowItWorks />
      <Features />
    </>
  );
}
