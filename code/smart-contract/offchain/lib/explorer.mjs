// Text for the "Tx ID" line an offchain script prints after submitting.
//
// A public-network transaction links to cardanoscan under its network
// subdomain. A local devnet transaction has no public explorer, so the script
// prints the bare id with a note instead of a link that would not resolve.
export function txIdLogText({ txHash, network, isDevnet }) {
  if (isDevnet) {
    return `${txHash} (local devnet transaction; no public explorer)`;
  }
  const subdomain = network === "preprod" ? "preprod." : "";
  return `view on https://${subdomain}cardanoscan.io/transaction/${txHash}`;
}
