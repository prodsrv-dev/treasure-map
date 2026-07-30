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
