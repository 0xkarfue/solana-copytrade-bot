import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { prisma, connection } from "../../instance"
import { executeCopyTrade } from "./copyTrade";


const activeMonitors: Map<string, number> = new Map();
const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";



export async function startMonitoring(walletAddress: string, userId: string, bot: any) {
    // Don't start if already monitoring
    if (activeMonitors.has(walletAddress)) {
        console.log(`Already monitoring ${walletAddress}`);
        return;
    }

    const publicKey = new PublicKey(walletAddress);

    console.log(`👀 Started monitoring: ${walletAddress}`);

    // Subscribe to all logs for this wallet
    const subscriptionId = connection.onLogs(
        publicKey,
        async (logs, context) => {
            try {
                console.log(`🔔 Transaction detected for ${walletAddress}`);
                console.log(`Signature: ${logs.signature}`);

                await analyzeAndCopyTrade(logs.signature, walletAddress, userId, bot);
            } catch (error) {
                console.error("Error processing transaction:", error);
            }
        },
        "confirmed"
    );

    activeMonitors.set(walletAddress, subscriptionId);

    console.log(`✅ Monitor active with subscription ID: ${subscriptionId}`);
}


export function stopMonitoring(walletAddress: string) {
    const subscriptionId = activeMonitors.get(walletAddress);

    if (subscriptionId) {
        connection.removeOnLogsListener(subscriptionId);
        activeMonitors.delete(walletAddress);
        console.log(`🛑 Stopped monitoring: ${walletAddress}`);
    }
}

async function analyzeAndCopyTrade(
    signature: string,
    targetWallet: string,
    userId: string,
    bot: any
) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
        });

        if (!tx || !tx.meta) {
            console.log("Transaction not found or no metadata");
            return;
        }

        if (tx.meta.err) {
            console.log("Transaction failed, skipping");
            return;
        }

        const isJupiterSwap = tx.transaction.message.accountKeys.some(
            (key) => key.pubkey.toString() === JUPITER_PROGRAM_ID
        );

        if (!isJupiterSwap) {
            console.log("Not a Jupiter swap, skipping");
            return;
        }

        console.log("🔄 This is a SWAP transaction!");

        const swapDetails = extractSwapDetails(tx);

        if (!swapDetails) {
            console.log("Could not extract swap details");
            return;
        }

        console.log("Swap Details:", swapDetails);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { copySettings: true }
        });

        if (!user || !user.copySettings || !user.copySettings.isActive) {
            console.log("User not found or copy settings inactive");
            return;
        }

        await bot.api.sendMessage(
            user.tgUserId,
            `🔔 *Trade Detected!*\n\n` +
            `👤 Target: \`${targetWallet.slice(0, 8)}...${targetWallet.slice(-8)}\`\n` +
            `📥 Sold: ${swapDetails.inputAmount} ${swapDetails.inputSymbol}\n` +
            `📤 Bought: ${swapDetails.outputAmount} ${swapDetails.outputSymbol}\n\n` +
            `⚡ Copying trade...`,
            { parse_mode: "Markdown" }
        );

        await executeCopyTrade(
            user,
            swapDetails,
            user.copySettings.copyPercentage,
            user.copySettings.maxTradeAmount,
            bot
        );

    } catch (error) {
        console.error("Error analyzing trade:", error);
    }
}

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

function extractSwapDetails(tx: ParsedTransactionWithMeta): SwapDetails | null {
  try {
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    let inputToken: string | null = null;
    let outputToken: string | null = null;
    let inputAmount = 0;
    let outputAmount = 0;
    let inputDecimals = 9;
    let outputDecimals = 9;

    for (const preBalance of preBalances) {
      const postBalance = postBalances.find(
        (post) => post.accountIndex === preBalance.accountIndex
      );

      if (!postBalance) continue;

      const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
      const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
      const change = postAmount - preAmount;

      if (change < 0) {
        inputToken = preBalance.mint;
        inputAmount = Math.abs(change);
        inputDecimals = preBalance.uiTokenAmount.decimals;
      } else if (change > 0) {
        outputToken = postBalance.mint;
        outputAmount = change;
        outputDecimals = postBalance.uiTokenAmount.decimals;
      }
    }

    const preSOL = tx.meta?.preBalances || [];
    const postSOL = tx.meta?.postBalances || [];
    
    if (preSOL.length > 0 && postSOL.length > 0) {
        //@ts-ignore
      const solChange = (postSOL[0] - preSOL[0]) / 1e9; 
      
      if (solChange < 0 && !inputToken) {
        inputToken = "So11111111111111111111111111111111111111112";
        inputAmount = Math.abs(solChange);
        inputDecimals = 9;
      } else if (solChange > 0 && !outputToken) {
        outputToken = "So11111111111111111111111111111111111111112";
        outputAmount = solChange;
        outputDecimals = 9;
      }
    }

    if (!inputToken || !outputToken) {
      return null;
    }

    return {
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      inputSymbol: inputToken === "So11111111111111111111111111111111111111112" ? "SOL" : "TOKEN",
      outputSymbol: outputToken === "So11111111111111111111111111111111111111112" ? "SOL" : "TOKEN",
      inputDecimals,
      outputDecimals
    };

  } catch (error) {
    console.error("Error extracting swap details:", error);
    return null;
  }
}

// Start monitoring all active copy trades on bot startup
export async function startAllMonitors(bot: any) {
  try {
    const activeTargets = await prisma.targetWallet.findMany({
      where: { isActive: true },
      include: { user: true }
    });

    console.log(`🚀 Starting ${activeTargets.length} monitors...`);

    for (const target of activeTargets) {
      await startMonitoring(target.address, target.userId, bot);
    }

    console.log("✅ All monitors started!");
  } catch (error) {
    console.error("Error starting monitors:", error);
  }
}