import LectureSection from "@/components/LectureSection";
import FAQSection from "@/components/FAQSection";
import HeroSection from "@/components/HeroSection";
import MarketingSection from "@/components/MarketingSection";
import CoachesSection from "@/components/CoachesSection";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <LectureSection />
      {/* <MarketingSection /> */}
      <FAQSection />
      <CoachesSection />
    </main>
  );
}
