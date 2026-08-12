import { getLimiter } from "./rate-limiter.server";

export type DiscourseEventType = "purchase" | "refund";

type ForwardToDiscoursePayload = {
  customerEmail: string;
  productId: string;
  orderId: string;
  eventType: DiscourseEventType;
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
  const endpoint = `${discourseUrl.replace(/\/+$/, "")}/brandme/webhook`;
  const limiter = getLimiter(discourseUrl);

  return limiter.run(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BrandMe-Secret": connectionSecret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          success: false,
          error: `Discourse responded with HTTP ${response.status}: ${body.slice(0, 500)}`,
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "Discourse request timed out after 4 seconds",
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
