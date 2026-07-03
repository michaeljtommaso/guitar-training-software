import { describe, expect, it } from "vitest";
import { parseQueueJsonl } from "./jsonlParse";

describe("parseQueueJsonl", () => {
  it("parses valid lines and skips blank ones", () => {
    const text = [
      '{"clipId":"a","t":1.2,"code":"wrong_fret","conf":0.3}',
      "",
      '{"clipId":"b","t":0.4,"code":"ok","conf":0.9}',
      "  ",
    ].join("\n");
    const { items, errors } = parseQueueJsonl(text);
    expect(items).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(items[0].clipId).toBe("a");
  });

  it("collects errors for malformed lines without throwing", () => {
    const text = ['{"clipId":"a","t":1.2,"code":"wrong_fret","conf":0.3}', "not json", '{"clipId":"b"}'].join("\n");
    const { items, errors } = parseQueueJsonl(text);
    expect(items).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(2);
  });

  it("rejects an out-of-range confidence", () => {
    const { items, errors } = parseQueueJsonl('{"clipId":"a","t":0,"code":"ok","conf":1.5}');
    expect(items).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});
