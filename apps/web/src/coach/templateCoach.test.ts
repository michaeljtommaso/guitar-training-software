import { describe, expect, it } from "vitest";
import { DIAGNOSIS_CODES } from "../fusion";
import { answerLocally, explain, primaryDiagnosis, stringWord } from "./templateCoach";

describe("template coach", () => {
  it("has a teacher-authored string for every §9.1 code", () => {
    for (const code of DIAGNOSIS_CODES) {
      expect(explain(code, 2, "C").length).toBeGreaterThan(10);
    }
  });

  it("slot-fills the string name (standard numbering)", () => {
    expect(explain("muted_string", 2)).toContain("B");
    expect(explain("missing_note", 1)).toContain("high e");
    expect(stringWord(6)).toBe("low E");
    // no string → generic wording, no crash
    expect(explain("muted_string")).toContain("string");
  });

  it("picks the highest-confidence non-ok diagnosis (§9.3)", () => {
    const p = primaryDiagnosis([
      { code: "ok", conf: 0.9 },
      { code: "muted_string", conf: 0.6 },
      { code: "late_strum", conf: 0.4 },
    ]);
    expect(p?.code).toBe("muted_string");
  });

  it("answers locally and deterministically", () => {
    const diag = [{ code: "muted_string" as const, string: 2, conf: 0.6 }];
    const a = answerLocally(diag, "C");
    const b = answerLocally(diag, "C");
    expect(a).toEqual(b);
    expect(a.code).toBe("muted_string");
    expect(a.source).toBe("template");
    expect(a.provider).toBe("local");
  });

  it("returns ok when there are no diagnoses", () => {
    expect(answerLocally([]).code).toBe("ok");
  });
});
