export interface WhatsAppEmbeddedSignupConfig {
  appId: string;
  graphVersion: string;
  whatsappConfigId: string;
}

export interface WhatsAppEmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
}

type FacebookSdk = {
  init(options: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ): void;
};

async function loadFacebookSdk(config: WhatsAppEmbeddedSignupConfig) {
  const target = window as typeof window & { FB?: FacebookSdk; fbAsyncInit?: () => void };
  if (target.FB) {
    target.FB.init({ appId: config.appId, cookie: true, xfbml: false, version: config.graphVersion });
    return target.FB;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      error ? reject(error) : resolve();
    };
    const initialize = () => {
      if (!target.FB) return finish(new Error("SDK Meta non disponibile"));
      target.FB.init({ appId: config.appId, cookie: true, xfbml: false, version: config.graphVersion });
      finish();
    };
    const timeout = window.setTimeout(
      () => finish(new Error("Il login Meta non si è caricato in tempo")),
      20_000,
    );
    target.fbAsyncInit = initialize;

    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", initialize, { once: true });
      existing.addEventListener("error", () => finish(new Error("Impossibile caricare il login Meta")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/it_IT/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => finish(new Error("Impossibile caricare il login Meta"));
    document.body.appendChild(script);
  });
  if (!target.FB) throw new Error("SDK Meta non disponibile");
  return target.FB;
}

export async function launchWhatsAppEmbeddedSignup(
  config: WhatsAppEmbeddedSignupConfig,
): Promise<WhatsAppEmbeddedSignupResult> {
  const sdk = await loadFacebookSdk(config);
  return new Promise((resolve, reject) => {
    let code = "";
    let asset: Omit<WhatsAppEmbeddedSignupResult, "code"> | null = null;
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", listener);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const complete = () => {
      if (settled || !code || !asset) return;
      settled = true;
      cleanup();
      resolve({ code, ...asset });
    };
    const listener = (event: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/i.test(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      const result = payload as {
        type?: string;
        event?: string;
        data?: { waba_id?: string; phone_number_id?: string; business_id?: string };
      };
      if (result.type !== "WA_EMBEDDED_SIGNUP") return;
      if (result.event === "CANCEL") return fail(new Error("Configurazione WhatsApp annullata"));
      if (result.event === "FINISH" && result.data?.waba_id && result.data.phone_number_id) {
        asset = {
          wabaId: result.data.waba_id,
          phoneNumberId: result.data.phone_number_id,
          businessId: result.data.business_id,
        };
        complete();
      }
    };
    const timeout = window.setTimeout(
      () => fail(new Error("Meta non ha completato il collegamento WhatsApp")),
      120_000,
    );
    window.addEventListener("message", listener);
    sdk.login(
      (response) => {
        if (!response.authResponse?.code) return fail(new Error("Login Meta annullato o non autorizzato"));
        code = response.authResponse.code;
        complete();
      },
      {
        config_id: config.whatsappConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  });
}
