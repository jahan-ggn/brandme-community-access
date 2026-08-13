import { getLimiter } from "./rate-limiter.server";
import { createHmac } from "crypto";

export type DiscourseEventType = "purchase" | "refund";

type ForwardToDiscoursePayload = {
  event: DiscourseEventType;
  webhookId: string;
  orderId: string;
  productId: string;
  email: string;
};

type ForwardToDiscourseResult = {
  success: boolean;
  error?: string;
};

export async function forwardToDiscourse(
  discourseUrl: string,
  connectionSecret: string,
  payload: ForwardToDiscoursePayload,
): Promise<ForwardToDiscourseResult> {
  const endpoint = `${discourseUrl.replace(/\/+$/, "")}/brandme/access`;
  const limiter = getLimiter(discourseUrl);

  return limiter.run(async () => {
    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", connectionSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BrandMe-Timestamp": timestamp,
          "X-BrandMe-Signature": signature,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        return {
          success: false,
          error: `Discourse responded with HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "Discourse request timed out after 5 seconds",
        };
      }

      return {
        success: false,
        error:
          error instanceof Error
            ? `Discourse request failed: ${error.message}`
            : "Discourse request failed with an unknown error",
      };
    } finally {
      clearTimeout(timeout);
    }
  });
}
