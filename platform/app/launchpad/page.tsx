import Launchpad from "../../components/Launchpad";
import { getCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

// The Launchpad space: a flat searchable grid of every section. Reachable from the
// grid button in the top bar (and, later, by swiping left from the Command Center
// once the workspace slider lands behind NEXT_PUBLIC_WORKSPACE).
//
// The role is read here (server side) and passed down because Launchpad is a
// client component. Owner-only tiles must not render for the founder: the route
// itself already redirects her, but a visible tile that bounces on click is a
// dead end, and this grid is the only place a surface is discoverable.
export default function LaunchpadPage() {
  const user = getCurrentUser();
  return <Launchpad role={user?.role} />;
}
