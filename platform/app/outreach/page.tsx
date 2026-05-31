import { getOrgContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRecipientCounts } from "./actions";
import Composer from "./Composer";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  const counts = await getRecipientCounts();

  return (
    <Composer
      orgName={ctx.orgName}
      userEmail={ctx.userEmail || ""}
      counts={counts}
    />
  );
}
