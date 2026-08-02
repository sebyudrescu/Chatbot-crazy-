import "server-only";
import OpenAI from "openai";

let client: OpenAI | undefined;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata sul server");
  client ??= new OpenAI({ apiKey });
  return client;
}

export function createLazyOpenAI() {
  return new Proxy({} as OpenAI, {
    get(_target, property) {
      const liveClient = getOpenAIClient();
      const value = Reflect.get(liveClient, property, liveClient);
      return typeof value === "function" ? value.bind(liveClient) : value;
    },
  });
}
