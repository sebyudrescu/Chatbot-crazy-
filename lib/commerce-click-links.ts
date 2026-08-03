import "server-only";

import type { ProductCard } from "./commerce-types";
import { createCommerceClickToken } from "./commerce-click-signatures";

export function commerceClickEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.COMMERCE_CLICK_SECRET || env.APP_AUTH_SALT || "";
  try {
    const url = new URL(env.NEXT_PUBLIC_APP_URL || "");
    if (url.protocol !== "https:" || secret.length < 16) return null;
    return { appUrl: url.origin, secret };
  } catch {
    return null;
  }
}

export function trackedProductCards(cards: ProductCard[], context: { botId: string; conversationId: string; messageId: string }, now = Date.now()) {
  const environment = commerceClickEnvironment();
  if (!environment) return cards;
  return cards.map(card => {
    const token = createCommerceClickToken({
      v: 1,
      b: context.botId,
      p: card.productId,
      c: context.conversationId,
      m: context.messageId,
      exp: Math.floor(now / 1000) + 30 * 24 * 60 * 60,
    }, environment.secret);
    const productUrl = `${environment.appUrl}/api/commerce/click?token=${encodeURIComponent(token)}`;
    return {
      ...card,
      productUrl,
      actions: card.actions.map(action => action.type === "view" ? { ...action, url: productUrl } : action),
    };
  });
}
