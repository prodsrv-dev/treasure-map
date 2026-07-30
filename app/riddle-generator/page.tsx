import type { Metadata } from "next";
import RiddleGenerator from "./RiddleGenerator";
import "./riddle-generator.css";

export const metadata: Metadata = {
  title: "Free Scavenger Hunt Clue Generator for Kids | Riddle Sphinx",
  description:
    "Create scavenger hunt clues and rhyming riddles for kids, save your favorites, and build a complete treasure hunt.",
  openGraph: {
    title: "Riddle Sphinx — clue generator for kids",
    description: "Create playful clues, riddles, couplets, and poems for a kids' scavenger hunt.",
    images: ["/og.png"],
  },
};

export default function RiddleGeneratorPage() {
  return <RiddleGenerator />;
}
