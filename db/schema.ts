import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const riddleJobs = sqliteTable("riddle_jobs", {
  id: text("id").primaryKey(),
  answer: text("answer").notNull(),
  properties: text("properties").notNull(),
  age: text("age").notNull(),
  language: text("language").notNull(),
  format: text("format").notNull(),
  tone: text("tone").notNull(),
  status: text("status").notNull().default("pending"),
  result: text("result"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const keywordQueries = sqliteTable("keyword_queries", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  translation: text("translation").notNull(),
  language: text("language").notNull(),
  country: text("country").notNull(),
  category: text("category").notNull(),
  intent: text("intent").notNull(),
  trendFiveYears: integer("trend_five_years"),
  trendTwelveMonths: integer("trend_twelve_months"),
  season: text("season").notNull().default("Круглый год"),
  status: text("status").notNull().default("К проверке"),
  priority: text("priority").notNull().default("Средний"),
  notes: text("notes").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  trendData: text("trend_data").notNull().default(""),
  visible: integer("visible").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const monsterJobs = sqliteTable("monster_jobs", {
  id: text("id").primaryKey(),
  objectName: text("object_name").notNull(),
  locationName: text("location_name").notNull(),
  referenceKey: text("reference_key").notNull(),
  referenceType: text("reference_type").notNull(),
  referenceName: text("reference_name").notNull().default(""),
  resultKey: text("result_key"),
  resultType: text("result_type"),
  monsterName: text("monster_name"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
