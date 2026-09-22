import type { CardanoNetwork } from "./cardano-network";

export const SWITCHABLE_NETWORKS = ["mainnet", "preprod"] as const;
export type SwitchableNetwork = (typeof SWITCHABLE_NETWORKS)[number];
export type NetworkDeployments = Record<SwitchableNetwork, string | undefined>;

function deploymentOrigin(value: string | undefined, variable: string): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim());
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${variable} must be an HTTPS origin without a path, credentials, query, or fragment. HTTP is allowed only for localhost.`);
  }
  return url.origin;
}

export function parseNetworkDeployments(mainnet: string | undefined, preprod: string | undefined): NetworkDeployments {
  const deployments = {
    mainnet: deploymentOrigin(mainnet, "NEXT_PUBLIC_MAINNET_URL"),
    preprod: deploymentOrigin(preprod, "NEXT_PUBLIC_PREPROD_URL")
  };
  // Cookies ignore ports. Separate hostnames isolate consent and proposal sessions.
  if (deployments.mainnet && deployments.preprod &&
      new URL(deployments.mainnet).hostname === new URL(deployments.preprod).hostname) {
    throw new Error("Mainnet and Preprod deployments must use different hostnames.");
  }
  return deployments;
}

export function networkSwitchUrl(network: CardanoNetwork, deployments: NetworkDeployments): string | undefined {
  if (network === "preview") return undefined;
  const origin = deployments[network];
  // Always start at home. Wallet, proposal, and transaction state belongs to its network.
  return origin ? `${origin}/user` : undefined;
}

export const NETWORK_DEPLOYMENTS = parseNetworkDeployments(
  process.env.NEXT_PUBLIC_MAINNET_URL,
  process.env.NEXT_PUBLIC_PREPROD_URL
);
