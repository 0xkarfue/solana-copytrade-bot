import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
// import { swap } from "../../swap";
import { swap } from "../../swap";

const connection = new Connection(process.env.RPC_URL!);

interface SwapDetails {
  inputToken: string;
  outputToken: string;
  inputAmount: number;
  outputAmount: number;
  inputSymbol: string;
  outputSymbol: string;
  inputDecimals: number;
  outputDecimals: number;
}

export async function executeCopyTrade(
  user: any,
  swapDetails: SwapDetails,
  copyPercentage: number,
  maxTradeAmount: number,
  bot: any
) {
  try {
    let amountToTrade = swapDetails.inputAmount * (copyPercentage / 100);

    if (swapDetails.inputToken === "So11111111111111111111111111111111111111112") {
      if (amountToTrade > maxTradeAmount) {
        console.log(`Trade amount ${amountToTrade} exceeds max ${maxTradeAmount}, capping...`);
        amountToTrade = maxTradeAmount;
      }
    }

    const amountInSmallestUnit = Math.floor(
      amountToTrade * Math.pow(10, swapDetails.inputDecimals)
    );

    console.log(`Executing copy trade: ${amountToTrade} ${swapDetails.inputSymbol}`);

    const swapTxn = await swap(
      swapDetails.inputToken,
      swapDetails.outputToken,
      amountInSmallestUnit,
      user.publicKey
    );

    const secretKeyArray = Uint8Array.from(Buffer.from(user.privateKey, "base64"));
    const userKeypair = Keypair.fromSecretKey(secretKeyArray);

    const tx = VersionedTransaction.deserialize(
      Uint8Array.from(Buffer.from(swapTxn, "base64"))
    );

    tx.sign([userKeypair]);
    const signature = await connection.sendTransaction(tx);

    console.log(`✅ Copy trade successful! Signature: ${signature}`);

    // Notify user
    await bot.api.sendMessage(
      user.tgUserId,
      `✅ *Copy Trade Executed!*\n\n` +
      `📥 Sold: ${amountToTrade.toFixed(6)} ${swapDetails.inputSymbol}\n` +
      `📤 Buying: ${swapDetails.outputSymbol}\n` +
      `📊 Percentage: ${copyPercentage}%\n\n` +
      `🔗 [View Transaction](https://solscan.io/tx/${signature})`,
      { parse_mode: "Markdown" }
    );

    return signature;

  } catch (error: any) {
    console.error("Copy trade execution error:", error);

    // Notify user of failure
    await bot.api.sendMessage(
      user.tgUserId,
      `❌ *Copy Trade Failed!*\n\n` +
      `Error: ${error.message || "Unknown error"}\n\n` +
      `Please check your wallet balance and try again.`,
      { parse_mode: "Markdown" }
    );

    throw error;
  }
}