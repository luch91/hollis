const rpcUrl = "https://studio-dev.genlayer.com/api";
const expectedChainId = "0xf22d";

const response = await fetch(rpcUrl, {
  body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_chainId", params: [] }),
  headers: { "content-type": "application/json" },
  method: "POST",
});

if (!response.ok) {
  throw new Error(`Studio Dev chain check failed with HTTP ${response.status}.`);
}

const payload = await response.json();
if (payload?.result !== expectedChainId) {
  throw new Error(
    `Studio Dev chain check expected ${expectedChainId}, received ${String(payload?.result)}.`,
  );
}

console.log(`Studio Dev verified: ${rpcUrl} chain ID ${Number.parseInt(expectedChainId, 16)}.`);
