import { createAccount } from "genlayer-js";

export type GenLayerRuntimeAccountConfiguration = {
  address: string;
  privateKey: string;
};

export class GenLayerRuntimeAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenLayerRuntimeAccountError";
  }
}

export function assertGenLayerRuntimeAccount(
  configuration: GenLayerRuntimeAccountConfiguration,
): `0x${string}` {
  const account = createAccount(configuration.privateKey as `0x${string}`);
  if (account.address.toLowerCase() !== configuration.address.toLowerCase()) {
    throw new GenLayerRuntimeAccountError(
      "The GenLayer runtime private key does not match the configured public address.",
    );
  }
  return account.address;
}
