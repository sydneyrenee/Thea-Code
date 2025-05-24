import { AwsBedrockHandler } from "../bedrock";
import { ApiHandlerOptions } from "../../../shared/api";
import { NeutralConversationHistory } from "../../../shared/neutral-history";
import * as neutralBedrockFormat from "../../transform/neutral-bedrock-format";
import type { ApiStreamChunk } from '../../transform/stream'; // Import ApiStreamChunk

// Explicitly import the mocked module to access its exports within the mock
import * as BedrockRuntimeClientMock from "@aws-sdk/client-bedrock-runtime";

// Mock the AWS SDK

jest.mock("@aws-sdk/client-bedrock-runtime", () => {
  const mockConverseStreamCommand = jest.fn();
  const mockConverseCommand = jest.fn();

  const mockSend = jest.fn().mockImplementation((command) => { // Removed async
    // Check if the command is an instance of the mocked constructors from the imported mock
    if (command instanceof BedrockRuntimeClientMock.ConverseStreamCommand) {
      return Promise.resolve({ // Added Promise.resolve
        stream: {
          [Symbol.asyncIterator]: function* () { // Removed async
            // Metadata event (object)
            yield {
              metadata: {
                usage: {
                  inputTokens: 10,
                  outputTokens: 5,
                },
              },
            };
            // Content block start (object)
            yield {
              contentBlockStart: {
                start: {
                  text: "Test response",
                },
              },
            };
            // Message stop (object)
            yield {
              messageStop: {},
            };
          },
        },
      });
    } else if (command instanceof BedrockRuntimeClientMock.ConverseCommand) {
      return Promise.resolve({ // Added Promise.resolve
        output: new TextEncoder().encode(
          JSON.stringify({ content: "Test completion" })
        ),
      });
    }
    // Default return for any other command type
    return Promise.resolve({}); // Added Promise.resolve
  });

  return {
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
      config: {
        region: "us-east-1",
      },
    })),
    ConverseStreamCommand: mockConverseStreamCommand,
    ConverseCommand: mockConverseCommand,
  };
});

// Mock the neutral-bedrock-format module
jest.mock("../../transform/neutral-bedrock-format", () => ({
  convertToBedrockConverseMessages: jest.fn().mockReturnValue([
    { role: "user", content: [{ text: "Test message" }] },
  ]),
  convertToBedrockContentBlocks: jest.fn().mockReturnValue([
    { text: "Test content" },
  ]),
}));

describe("AwsBedrockHandler", () => {
  const options: ApiHandlerOptions = {
    awsAccessKey: "test-access-key",
    awsSecretKey: "test-secret-key",
    apiModelId: "anthropic.claude-v2",
  };

  let handler: AwsBedrockHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new AwsBedrockHandler(options);
  });

  describe("createMessage", () => {
    it("should convert neutral history to Bedrock format and stream response", async () => {
      const systemPrompt = "You are a helpful assistant";
      const messages: NeutralConversationHistory = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ];

      const stream = handler.createMessage(systemPrompt, messages);
      const chunks: ApiStreamChunk[] = [];

     for await (const chunk of stream) {
       chunks.push(chunk);
     }

     expect(neutralBedrockFormat.convertToBedrockConverseMessages).toHaveBeenCalledWith(messages);
     expect(chunks).toHaveLength(2);
     expect(chunks[0]).toEqual({
       type: "usage",
       inputTokens: 10,
       outputTokens: 5,
     });
     expect(chunks[1]).toEqual({ type: "text", text: "Test response" });
   });
  });

  describe("countTokens", () => {
    it("should use the base provider's implementation", async () => {
      // Mock the base provider's countTokens method
      const baseCountTokens = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(handler)),
        "countTokens"
      ).mockResolvedValue(15);

      const content: NeutralConversationHistory[0]['content'] = [{ type: "text", text: "Hello" }];
      const result = await handler.countTokens(content);

      expect(baseCountTokens).toHaveBeenCalledWith(content);
      expect(result).toBe(15);
    });
  });

  describe("completePrompt", () => {
    it("should complete a prompt and return the response", async () => {
      const result = await handler.completePrompt("Test prompt");
      expect(result).toBe("Test completion");
    });
  });
});
