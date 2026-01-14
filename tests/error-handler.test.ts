import { ErrorHandler } from "../src/error-handler";

describe("ErrorHandler", () => {
  it("should handle errors and return ApiError", () => {
    const handler = new ErrorHandler();
    const error = handler.handle(new Error("fail"), "step1");
    expect(error).toHaveProperty("message");
    expect(error).toHaveProperty("status");
  });
});
