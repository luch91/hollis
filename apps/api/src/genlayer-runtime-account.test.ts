import { createAccount, generatePrivateKey } from "genlayer-js";
import { describe, expect, it } from "vitest";
import {
  assertGenLayerRuntimeAccount,
  GenLayerRuntimeAccountError,
} from "./genlayer-runtime-account.js";

describe("GenLayer runtime account", () => {
  it("accepts a private key only when it derives the configured address", () => {
    const privateKey = generatePrivateKey();
    const address = createAccount(privateKey).address;
    expect(assertGenLayerRuntimeAccount({ address, privateKey })).toBe(address);
  });

  it("rejects a private key for a different runtime address", () => {
    const privateKey = generatePrivateKey();
    const otherAddress = createAccount(generatePrivateKey()).address;
    expect(() => assertGenLayerRuntimeAccount({ address: otherAddress, privateKey })).toThrow(
      GenLayerRuntimeAccountError,
    );
  });
});
