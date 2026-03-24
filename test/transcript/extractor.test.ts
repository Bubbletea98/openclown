import { describe, it, expect } from "vitest";
import {
  extractTextContent,
  extractExchanges,
  buildEvaluationContext,
} from "../../src/transcript/extractor.js";

describe("extractTextContent", () => {
  it("handles string content", () => {
    expect(extractTextContent("hello")).toBe("hello");
  });

  it("handles array content blocks", () => {
    const content = [
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ];
    expect(extractTextContent(content)).toBe("Hello \nworld");
  });

  it("filters non-text blocks", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "tool_use", name: "search", input: {} },
    ];
    expect(extractTextContent(content)).toBe("Hello");
  });

  it("handles null/undefined", () => {
    expect(extractTextContent(null)).toBe("");
    expect(extractTextContent(undefined)).toBe("");
  });
});

describe("extractExchanges", () => {
  it("extracts a simple user → assistant exchange", () => {
    const messages = [
      { role: "user", content: "Find restaurants" },
      { role: "assistant", content: "Here are 3 restaurants..." },
    ];

    const exchanges = extractExchanges(messages, 1);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].refNum).toBe(1);
    expect(exchanges[0].userRequest).toBe("Find restaurants");
    expect(exchanges[0].assistantResponse).toBe("Here are 3 restaurants...");
    expect(exchanges[0].toolCalls).toHaveLength(0);
  });

  it("extracts exchange with tool calls", () => {
    const messages = [
      { role: "user", content: "Find restaurants" },
      { role: "tool", content: "Search results: restaurant A, restaurant B" },
      { role: "assistant", content: "Found 2 restaurants" },
    ];

    const exchanges = extractExchanges(messages, 1);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].toolCalls).toHaveLength(1);
    expect(exchanges[0].toolCalls[0].content).toBe(
      "Search results: restaurant A, restaurant B",
    );
  });

  it("extracts multiple exchanges", () => {
    const messages = [
      { role: "user", content: "Question 1" },
      { role: "assistant", content: "Answer 1" },
      { role: "user", content: "Question 2" },
      { role: "tool", content: "Tool result" },
      { role: "assistant", content: "Answer 2" },
    ];

    const exchanges = extractExchanges(messages, 10);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].refNum).toBe(10);
    expect(exchanges[1].refNum).toBe(11);
    expect(exchanges[1].userRequest).toBe("Question 2");
  });

  it("skips assistant messages without text", () => {
    const messages = [
      { role: "user", content: "Do something" },
      { role: "assistant", content: "" },
    ];

    const exchanges = extractExchanges(messages, 1);
    expect(exchanges).toHaveLength(0);
  });

  it("handles array content in assistant messages", () => {
    const messages = [
      { role: "user", content: "Hello" },
      {
        role: "assistant",
        content: [{ type: "text", text: "Hi there!" }],
      },
    ];

    const exchanges = extractExchanges(messages, 1);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].assistantResponse).toBe("Hi there!");
  });
});

describe("buildEvaluationContext", () => {
  it("builds context with all parts", () => {
    const exchange = {
      refNum: 1,
      userRequest: "Find restaurants",
      toolCalls: [{ role: "tool", content: "Search results: A, B" }],
      assistantResponse: "Here are restaurants A and B.",
      rawMessages: [],
      timestamp: Date.now(),
    };

    const context = buildEvaluationContext(exchange, 4000);
    expect(context).toContain("## User Request");
    expect(context).toContain("Find restaurants");
    expect(context).toContain("## Tool Results (1 results)");
    expect(context).toContain("Search results: A, B");
    expect(context).toContain("## Final Response");
    expect(context).toContain("Here are restaurants A and B.");
  });

  it("truncates when over token budget", () => {
    const exchange = {
      refNum: 1,
      userRequest: "x".repeat(20000),
      toolCalls: [],
      assistantResponse: "Done",
      rawMessages: [],
      timestamp: Date.now(),
    };

    const context = buildEvaluationContext(exchange, 100);
    expect(context).toContain("(context truncated to fit token budget)");
    expect(context.length).toBeLessThan(20000);
  });
});
