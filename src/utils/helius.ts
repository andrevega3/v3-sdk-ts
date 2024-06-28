import bs58 from "bs58";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPriorityFeeEstimate(priorityLevel: any, transaction: any) {
    if (!process.env.RPC_URL) {
        throw new Error("Missing rpc url");
      }
    const HeliusURL = process.env.RPC_URL;
    const response = await fetch(HeliusURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: bs58.encode(transaction.serialize()), // Pass the serialized transaction in Base58
            options: { priorityLevel: priorityLevel },
          },
        ],
      }),
    });
    const data = await response.json();
    console.log(
      "Fee in function for",
      priorityLevel,
      " :",
      data.result.priorityFeeEstimate
    );
    return data.result.priorityFeeEstimate;
  }