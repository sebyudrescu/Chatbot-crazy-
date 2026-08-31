import { RegistrationForm } from "@/components/RegistrationForm";

export default function RegisterPage() {
  return <RegistrationForm enabled={process.env.SELF_SERVICE_SIGNUP_ENABLED === "true"} />;
}
