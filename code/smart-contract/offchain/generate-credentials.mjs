// Generate the local signing keys used by every other offchain example: writes
// wallet_1.sk / wallet_1.addr and wallet_2.sk / wallet_2.addr (skipping any key
// that already exists, so it never overwrites). Fund the printed wallet_1
// address from a testnet faucet before running mint-stt.mjs.
// RUN ORDER: 1st — everything else needs these credentials.
import { MeshWallet } from "@meshsdk/core";
import fs from "node:fs";

async function generateWallet(name) {
  if (fs.existsSync(`${name}.sk`)) {
    fs.chmodSync(`${name}.sk`, 0o600);
    console.log(`${name} already exists, skipping generation`);
    return;
  }

  const secret_key = MeshWallet.brew(false);
  try {
    fs.writeFileSync(`${name}.sk`, secret_key.join(" "), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      fs.chmodSync(`${name}.sk`, 0o600);
      console.log(`${name} already exists, skipping generation`);
      return;
    }
    throw error;
  }

  const wallet = new MeshWallet({
    networkId: 0,
    key: {
      type: "mnemonic",
      words: secret_key,
    },
  });

  const address = (await wallet.getUnusedAddresses())[0];
  fs.writeFileSync(`${name}.addr`, address);
  console.log(`${name} address generated: ${address}`);
}

await generateWallet("wallet_1");
await generateWallet("wallet_2");
