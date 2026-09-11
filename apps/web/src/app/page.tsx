import { redirect } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";

export default async function Home() {
  const current = await readHollisSession();
  redirect(current ? "/app" : "/sign-in");
}
