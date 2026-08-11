export async function forwardToDiscourse(
  discourseUrl: string,
  connectionSecret: string,
  payload: {
    customerEmail: string;
    productId: string;
    orderId: string;
    eventType: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = `${discourseUrl.replace(/\/+$/, "")}/brandme/webhook`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BrandMe-Secret": connectionSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Discourse responded ${response.status}: ${body}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
