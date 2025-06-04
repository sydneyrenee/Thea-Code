import type { ToolUse } from "../assistant-message";
import type { TheaTask } from "../TheaTask";

// Use require to avoid hoisting issues with jest mocks
const { accessMcpResourceTool } = require("../tools/accessMcpResourceTool");

describe("accessMcpResourceTool", () => {
  const askApproval = jest.fn();
  const handleError = jest.fn();
  const removeClosingTag = (_: string, val?: string) => val;

  function createMockTask(): jest.Mocked<TheaTask> {
    return {
      consecutiveMistakeCount: 0,
      sayAndCreateMissingParamError: jest.fn().mockResolvedValue("err"),
      webviewCommunicator: { ask: jest.fn(), say: jest.fn() } as any,
      providerRef: { deref: jest.fn() } as any,
    } as unknown as jest.Mocked<TheaTask>;
  }

  test("increments mistake count and reports missing server_name", async () => {
    const theaTask = createMockTask();
    const pushToolResult = jest.fn();
    const block: ToolUse = {
      type: "tool_use",
      name: "access_mcp_resource",
      params: { uri: "/res" },
      partial: false,
    };

    await accessMcpResourceTool(
      theaTask,
      block,
      askApproval,
      handleError,
      pushToolResult,
      removeClosingTag
    );

    expect(theaTask.consecutiveMistakeCount).toBe(1);
    expect(theaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith(
      "access_mcp_resource",
      "server_name"
    );
    expect(pushToolResult).toHaveBeenCalledWith("err");
  });

  test("increments mistake count and reports missing uri", async () => {
    const theaTask = createMockTask();
    const pushToolResult = jest.fn();
    const block: ToolUse = {
      type: "tool_use",
      name: "access_mcp_resource",
      params: { server_name: "srv" },
      partial: false,
    };

    await accessMcpResourceTool(
      theaTask,
      block,
      askApproval,
      handleError,
      pushToolResult,
      removeClosingTag
    );

    expect(theaTask.consecutiveMistakeCount).toBe(1);
    expect(theaTask.sayAndCreateMissingParamError).toHaveBeenCalledWith(
      "access_mcp_resource",
      "uri"
    );
    expect(pushToolResult).toHaveBeenCalledWith("err");
  });
});
