import { MeshWallet } from "@meshsdk/core";
import fs from "node:fs";

if (fs.existsSync("wallet_1.sk")) {
  console.log("Wallet_1 already exists, skipping generation");
  process.exit(0);
}
if (fs.existsSync("wallet_2.sk")) {
  console.log("Wallet_2 already exists, skipping generation");
  process.exit(0);
}

let secret_key = MeshWallet.brew(false);

fs.writeFileSync("wallet_1.sk", secret_key.join(" "));

const wallet = new MeshWallet({
  networkId: 0,
  key: {
    type: "mnemonic",
    words: secret_key,
  },
});

fs.writeFileSync("wallet_1.addr", (await wallet.getUnusedAddresses())[0]);
console.log(
  `Wallet address generated: ${(await wallet.getUnusedAddresses())[0]}`
);

const secret_key2 = MeshWallet.brew(false);

fs.writeFileSync("wallet_2.sk", secret_key2.join(" "));

const wallet2 = new MeshWallet({
  networkId: 0,
  key: {
    type: "mnemonic",
    words: secret_key2,
  },
});

fs.writeFileSync("wallet_2.addr", (await wallet2.getUnusedAddresses())[0]);
console.log(
  `Other Wallet address generated: ${(await wallet2.getUnusedAddresses())[0]}`
);
