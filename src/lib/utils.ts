import fs from "fs";
import {
  AeSdk,
  CompilerHttp,
  Encoded,
  MemoryAccount,
  Node,
} from "@aeternity/aepp-sdk";
import { readFile } from "fs/promises";

export const networks = JSON.parse(
  await readFile(new URL("./networks.json", import.meta.url)).then((file) =>
    file.toString("utf-8"),
  ),
);

export const wallets = JSON.parse(
  await readFile(new URL("./wallets.json", import.meta.url)).then((file) =>
    file.toString("utf-8"),
  ),
);

export function getContractContent(contractPath: string): string {
  return fs.readFileSync(contractPath, "utf8");
}

export function getDefaultAccounts(): MemoryAccount[] {
  return wallets.map(
    (keypair) =>
      new MemoryAccount(keypair.secretKey as Encoded.AccountSecretKey),
  );
}

export function getSdk(
  options: ConstructorParameters<typeof Node>[1] &
    ConstructorParameters<typeof CompilerHttp>[1],
): AeSdk {
  const instance = new Node(networks.devmode.nodeUrl, options);

  return new AeSdk({
    accounts: getDefaultAccounts(),
    nodes: [{ name: "node", instance }],
    onCompiler: new CompilerHttp(networks.devmode.compilerUrl, options),
  });
}

export async function awaitKeyBlocks(
  aeSdk: AeSdk,
  n: number = 1,
): Promise<void> {
  const height = await aeSdk.getHeight();
  await fetch(`http://localhost:3001/emit_kb?n=${n}`);
  await aeSdk.awaitHeight(height + n);
}

let snapshotHeight = -1;

export async function createSnapshot(aeSdk: AeSdk): Promise<void> {
  snapshotHeight = await aeSdk.getHeight();
  await awaitKeyBlocks(aeSdk, 1);
}

export async function rollbackHeight(
  aeSdk: AeSdk,
  height: number,
): Promise<void> {
  const currentBlockHeight = await aeSdk.getHeight();
  if (currentBlockHeight > height) {
    await fetch(`http://localhost:3001/rollback?height=${height}`);
  }
}

export async function rollbackSnapshot(aeSdk: AeSdk): Promise<void> {
  if (snapshotHeight === -1) throw new Error("no snapshot created");
  return rollbackHeight(aeSdk, snapshotHeight);
}
