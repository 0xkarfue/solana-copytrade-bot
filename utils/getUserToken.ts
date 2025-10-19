import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { connection } from "../instance"

// const connection = new Connection(
//   process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
//   "confirmed"
// );

export async function getUserTokens(walletAddress: string) {
  const publicKey = new PublicKey(walletAddress);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });

  
  const solBalanceLamports = await connection.getBalance(publicKey);
  const solBalance = solBalanceLamports / 1e9;

  const tokens = [];

  tokens.push({
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    amount: solBalance,
    decimals: 9,
    uiAmount: solBalance.toFixed(4),
  });

  for (const { account } of tokenAccounts.value) {
    const parsedInfo = account.data.parsed.info;
    const amount = parsedInfo.tokenAmount.uiAmount;

    if (!amount || amount === 0) continue;

    tokens.push({
      mint: parsedInfo.mint,
      amount: amount,
      decimals: parsedInfo.tokenAmount.decimals,
      uiAmount: amount.toFixed(parsedInfo.tokenAmount.decimals), 
      // Note: You'll need to fetch symbol/name from token metadata or DexScreener API
    });
  }

  return tokens;
}