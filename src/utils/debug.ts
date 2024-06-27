import { PublicKey } from "@solana/web3.js";
import { PARCL_V3_PROGRAM_ID } from "../constants";
import BN from "bn.js";
import { SETTLEMENT_REQUEST_PREFIX } from "../pda";

export function stringifyBigInt(obj: unknown) {
    return JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
}

export function findSettlementRequestId(owner: PublicKey, targetPda: PublicKey): number | BN {
    const programId = new PublicKey(PARCL_V3_PROGRAM_ID);
  
    for (let i = 0; i < 100000; i++) { // Example range, adjust based on expected ID range
      const id = new BN(i);
      const [pda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(SETTLEMENT_REQUEST_PREFIX),
          owner.toBytes(),
          id.toArrayLike(Buffer, "le", 8),
        ],
        programId
      );
  
      if (pda.equals(targetPda)) {
        return id;
      }
    }
    return -1; // Return null if not found
  }