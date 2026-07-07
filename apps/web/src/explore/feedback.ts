// Explore listening feedback — HeardState shape (Task 5 fills in the engine).
export interface HeardState {
  chordHeard: boolean;
  strings?: Array<"ok" | "pending" | "muted-expected">;
}
