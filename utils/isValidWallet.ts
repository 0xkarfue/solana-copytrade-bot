import { PublicKey, Connection } from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!);

export async function isValidWallet(address: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // 1. Check if it's a valid Solana address format
    const publicKey = new PublicKey(address);
    
    // 2. Check if address is on the curve (valid Solana address)
    if (!PublicKey.isOnCurve(publicKey.toBuffer())) {
      return { valid: false, error: "Invalid Solana address format" };
    }

    // 3. Check if wallet exists on-chain (has been used)
    const accountInfo = await connection.getAccountInfo(publicKey);
    
    // Note: accountInfo will be null for brand new wallets that haven't received anything
    // For copy trading, we want wallets that have activity
    if (!accountInfo) {
      return { valid: false, error: "Wallet has no on-chain activity" };
    }

    // 4. Check if wallet has recent transactions (is active)
    const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 1 });
    
    if (signatures.length === 0) {
      return { valid: false, error: "Wallet has no transaction history" };
    }

    // 5. Optional: Check if wallet holds tokens (for trading)
    const balance = await connection.getBalance(publicKey);
    
    if (balance === 0) {
      // Warning, but still valid
      console.log("Warning: Target wallet has 0 SOL balance");
    }

    return { valid: true };

  } catch (error) {
    console.error("Wallet validation error:", error);
    return { valid: false, error: "Invalid wallet address" };
  }
}