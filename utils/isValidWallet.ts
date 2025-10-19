import { PublicKey, Connection } from "@solana/web3.js";

import { connection } from "../instance"

export async function isValidWallet(address: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const publicKey = new PublicKey(address);
    
    
    if (!PublicKey.isOnCurve(publicKey.toBuffer())) {
      return { valid: false, error: "Invalid Solana address format" };
    }

    
    const accountInfo = await connection.getAccountInfo(publicKey);
    
    
    if (!accountInfo) {
      return { valid: false, error: "Wallet has no on-chain activity" };
    }

    
    const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 1 });
    
    if (signatures.length === 0) {
      return { valid: false, error: "Wallet has no transaction history" };
    }

    
    const balance = await connection.getBalance(publicKey);
    
    if (balance === 0) {
      console.log("Warning: Target wallet has 0 SOL balance");
    }

    return { valid: true };

  } catch (error) {
    console.error("Wallet validation error:", error);
    return { valid: false, error: "Invalid wallet address" };
  }
}