import type { Metadata } from "next";
import KeywordBoard from "./KeywordBoard";
import "./keyword-board.css";

export const metadata: Metadata = {
  title: "Доска поисковых запросов — Treasure Map Research",
  description: "Исследовательская доска семантики, сезонности и спроса для продукта Treasure Map.",
};

export default function KeywordBoardPage() {
  return <KeywordBoard />;
}
