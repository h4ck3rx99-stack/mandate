import { BuildScroll } from "@/components/BuildScroll";
import { agentNames, rootName } from "@/lib/server";

export default function Home() {
  return <BuildScroll names={[`treasury.${rootName()}`, ...agentNames()]} />;
}
