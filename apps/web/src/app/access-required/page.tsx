import { redirect } from "next/navigation";

export default function AccessRequiredPage() {
  redirect("/onboarding");
}
