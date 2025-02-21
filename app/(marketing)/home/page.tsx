/*
This server page is the marketing homepage.
*/

"use server"

import { HeroSection } from "@/components/landing/hero"

export default async function HomePage() {
  return (
    <div className="pb-20">
      <HeroSection />
    </div>
  )
}
